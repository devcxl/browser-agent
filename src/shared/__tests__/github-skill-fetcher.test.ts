import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSkillsFromGitHub } from '../github-skill-fetcher';

// ---------------------------------------------------------------------------
// Mock 工具
// ---------------------------------------------------------------------------

/** 每次调用都返回全新的 Response（同一目录 URL 会被 findSkillDirs 与
 *  collectResourcePaths 重复请求，Response body 只能消费一次） */
function jsonRoute(body: unknown): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

function errorRoute(status: number, statusText: string): () => Response {
  return () => new Response('err', { status, statusText });
}

function base64Encode(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

function mockFetch(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes[url];
    if (hit) return hit();
    return new Response('Not found', { status: 404, statusText: 'Not Found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const SKILL_MD = `---
name: Test Skill
description: 这是一个测试技能
---

# Test Skill

执行以下步骤。
`;

describe('fetchSkillsFromGitHub', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── parseSource：地址解析 ─────────────────────────────

  it('无法解析的地址应直接抛出错误（不发起任何请求）', async () => {
    const fetchMock = mockFetch({});
    await expect(fetchSkillsFromGitHub('not-a-github-url')).rejects.toThrow(
      '无法解析 GitHub 地址',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('应解析 https://github.com/owner/repo.git 形式地址', async () => {
    const fetchMock = mockFetch({
      'https://api.github.com/repos/owner/repo/contents/skills': jsonRoute([]),
    });
    await expect(
      fetchSkillsFromGitHub('https://github.com/owner/repo.git'),
    ).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.github.com/repos/owner/repo/contents/skills',
    );
  });

  it('应解析 github.com/owner/repo（无协议前缀）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([]),
    });
    await expect(fetchSkillsFromGitHub('github.com/o/r')).resolves.toEqual([]);
  });

  // ── 请求头 / 限流 ─────────────────────────────────────

  it('携带 token 时请求头应包含 Bearer 认证', async () => {
    const fetchMock = mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([]),
    });
    await fetchSkillsFromGitHub('https://github.com/o/r', 'secret-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/contents/skills',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      }),
    );
  });

  it('未携带 token 时请求头不应包含 Authorization', async () => {
    const fetchMock = mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([]),
    });
    await fetchSkillsFromGitHub('https://github.com/o/r');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('目录请求 403 且无 token 时命中限流分支（错误被目录容错吸收 → []）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': errorRoute(403, 'Forbidden'),
    });
    // 注意：fetchJSON 抛出的限流错误在 findSkillDirs 的 catch 中被吸收，
    // 这是生产代码的现有行为（无法传播到调用方）。
    await expect(fetchSkillsFromGitHub('https://github.com/o/r')).resolves.toEqual([]);
  });

  it('目录请求 403 且带 token 时走普通错误分支（同样被吸收）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': errorRoute(403, 'Forbidden'),
    });
    await expect(
      fetchSkillsFromGitHub('https://github.com/o/r', 'token-here'),
    ).resolves.toEqual([]);
  });

  it('SKILL.md 请求 401 时该技能被跳过', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': errorRoute(
        401,
        'Unauthorized',
      ),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result).toEqual([]);
  });

  // ── 递归扫描目录结构 ──────────────────────────────────

  it('在多层目录结构中递归定位多个 SKILL.md 并合并结果', async () => {
    mockFetch({
      // 顶层 skills：含一个 SKILL.md 目录 + 若干子目录
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
        { name: 'nested', path: 'skills/nested', type: 'dir' },
        { name: 'readme.md', path: 'skills/readme.md', type: 'file' },
      ]),
      // skills/a 是 skill 根（会被 findSkillDirs 与 collectResourcePaths 各请求一次）
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
        { name: 'helper.md', path: 'skills/a/helper.md', type: 'file' },
      ]),
      // skills/nested 无 SKILL.md，继续深入
      'https://api.github.com/repos/o/r/contents/skills/nested': jsonRoute([
        { name: 'b', path: 'skills/nested/b', type: 'dir' },
        { name: 'notes.txt', path: 'skills/nested/notes.txt', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/nested/b': jsonRoute([
        { name: 'SKILL.md', path: 'skills/nested/b/SKILL.md', type: 'file' },
        { name: 'sub', path: 'skills/nested/b/sub', type: 'dir' },
      ]),
      // sub 为空目录
      'https://api.github.com/repos/o/r/contents/skills/nested/b/sub': jsonRoute([]),
      // SKILL.md 内容（base64）
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode(SKILL_MD),
      }),
      // nested/b 的 SKILL.md 无 name → 回退到目录名
      'https://api.github.com/repos/o/r/contents/skills/nested/b/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode('---\ndescription: nested skill\n---\n# nested body'),
      }),
      // 资源文件
      'https://api.github.com/repos/o/r/contents/skills/a/helper.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode(SAMPLE_RESOURCE),
      }),
    });

    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result).toHaveLength(2);

    const [skillA, skillB] = result;
    // frontmatter.name 优先；description 来自 frontmatter；prompt 为 body
    expect(skillA!.name).toBe('Test Skill');
    expect(skillA!.description).toBe('这是一个测试技能');
    expect(skillA!.prompt).toContain('# Test Skill');
    expect(skillA!.resources).toEqual([
      { path: 'helper.md', content: SAMPLE_RESOURCE },
    ]);

    // 第二个技能来自嵌套目录：无 name → 取目录名，description 来自 frontmatter
    expect(skillB!.name).toBe('b');
    expect(skillB!.description).toBe('nested skill');
    expect(skillB!.prompt).toContain('# nested body');
    expect(skillB!.resources).toEqual([]);
  });

  // ── SKILL.md 内容解析容错 ────────────────────────────

  it('无 frontmatter 的 SKILL.md：使用目录名作为 name，整段当 body', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'plain', path: 'skills/plain', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/plain': jsonRoute([
        { name: 'SKILL.md', path: 'skills/plain/SKILL.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/plain/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode('没有 frontmatter 的内容'),
      }),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('plain');
    expect(result[0]!.description).toBe('');
    expect(result[0]!.prompt).toBe('没有 frontmatter 的内容');
  });

  it('frontmatter 中部分 key 缺省时用空串兜底', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'partial', path: 'skills/partial', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/partial': jsonRoute([
        { name: 'SKILL.md', path: 'skills/partial/SKILL.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/partial/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode('---\nname: OnlyName\n---\nbody text'),
      }),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result[0]!.name).toBe('OnlyName');
    expect(result[0]!.description).toBe('');
    expect(result[0]!.prompt).toBe('body text');
  });

  it('SKILL.md 抓取失败（500）时应跳过该 skill（continue）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'broken', path: 'skills/broken', type: 'dir' },
        { name: 'ok', path: 'skills/ok', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/broken': jsonRoute([
        { name: 'SKILL.md', path: 'skills/broken/SKILL.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/broken/SKILL.md': errorRoute(
        500,
        'Server Error',
      ),
      'https://api.github.com/repos/o/r/contents/skills/ok': jsonRoute([
        { name: 'SKILL.md', path: 'skills/ok/SKILL.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/ok/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode('---\nname: OK\n---\nok body'),
      }),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('OK');
  });

  it('目录列表接口失败时视为无技能（findSkillDirs 容错）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': errorRoute(404, 'Not Found'),
    });
    await expect(
      fetchSkillsFromGitHub('https://github.com/o/r'),
    ).resolves.toEqual([]);
  });

  it('fetch 抛网络异常时应被目录容错吸收', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchSkillsFromGitHub('https://github.com/o/r'),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── 资源文件收集 ──────────────────────────────────────

  it('子资源文件读取失败时应跳过该资源但保留其余资源', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
        { name: 'good.md', path: 'skills/a/good.md', type: 'file' },
        { name: 'bad.md', path: 'skills/a/bad.md', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode(SKILL_MD),
      }),
      'https://api.github.com/repos/o/r/contents/skills/a/good.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode('good content'),
      }),
      'https://api.github.com/repos/o/r/contents/skills/a/bad.md': errorRoute(
        500,
        'Server Error',
      ),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result[0]!.resources).toEqual([
      { path: 'good.md', content: 'good content' },
    ]);
  });

  it('资源文件用非 base64 编码返回时应直接使用 content 字段', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
        { name: 'raw.txt', path: 'skills/a/raw.txt', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': jsonRoute({
        encoding: 'utf-8',
        content: 'plain text skill',
      }),
      'https://api.github.com/repos/o/r/contents/skills/a/raw.txt': jsonRoute({
        encoding: 'utf-8',
        content: 'raw resource text',
      }),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result[0]!.prompt).toBe('plain text skill');
    expect(result[0]!.resources).toEqual([
      { path: 'raw.txt', content: 'raw resource text' },
    ]);
  });

  it('递归收集子目录内的资源文件', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
        { name: 'assets', path: 'skills/a/assets', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode(SKILL_MD),
      }),
      'https://api.github.com/repos/o/r/contents/skills/a/assets': jsonRoute([
        { name: 'logo.png', path: 'skills/a/assets/logo.png', type: 'file' },
        { name: 'deep', path: 'skills/a/assets/deep', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/assets/logo.png': jsonRoute({
        encoding: 'base64',
        content: base64Encode('PNGDATA'),
      }),
      'https://api.github.com/repos/o/r/contents/skills/a/assets/deep': jsonRoute([
        { name: 'nested.txt', path: 'skills/a/assets/deep/nested.txt', type: 'file' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/assets/deep/nested.txt':
        jsonRoute({ encoding: 'base64', content: base64Encode('nested content') }),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    const paths = result[0]!.resources.map((r) => r.path).sort();
    expect(paths).toEqual(['assets/deep/nested.txt', 'assets/logo.png']);
  });

  it('资源收集时子目录列表请求失败应返回空资源（collectResourcePaths 容错）', async () => {
    mockFetch({
      'https://api.github.com/repos/o/r/contents/skills': jsonRoute([
        { name: 'a', path: 'skills/a', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a': jsonRoute([
        { name: 'SKILL.md', path: 'skills/a/SKILL.md', type: 'file' },
        { name: 'assets', path: 'skills/a/assets', type: 'dir' },
      ]),
      'https://api.github.com/repos/o/r/contents/skills/a/SKILL.md': jsonRoute({
        encoding: 'base64',
        content: base64Encode(SKILL_MD),
      }),
      // assets 目录请求失败
      'https://api.github.com/repos/o/r/contents/skills/a/assets': errorRoute(
        404,
        'Not Found',
      ),
    });
    const result = await fetchSkillsFromGitHub('https://github.com/o/r');
    expect(result[0]!.resources).toEqual([]);
  });
});

const SAMPLE_RESOURCE = 'resource data 中文内容';
