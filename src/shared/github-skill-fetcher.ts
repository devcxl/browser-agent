import type { SkillResource } from '@/shared/types';

interface GitHubEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

interface GitHubFile {
  content: string;
  encoding: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  prompt: string;
  resources: SkillResource[];
}

function parseSource(source: string): { owner: string; repo: string } | null {
  const clean = source.replace(/^https?:\/\//, '').replace(/^github\.com\//, '');
  const match = clean.match(/^([^/]+)\/([^/]+?)(?:\/|$)/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, '') };
}

async function fetchJSON<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (res.status === 403 && !token) {
    throw new Error(
      'GitHub API 限流（无认证 60次/小时），请在扩展设置中配置 GITHUB_TOKEN',
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} (${url})`);
  }
  return res.json();
}

async function fetchRawFile(owner: string, repo: string, path: string, token?: string): Promise<string> {
  const data = await fetchJSON<GitHubFile>(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    token,
  );
  if (data.encoding === 'base64') {
    const binary = atob(data.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
  return data.content;
}

function parseSkillMd(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  const frontmatter: Record<string, string> = {};
  const lines = match[1]!.split('\n');
  for (const line of lines) {
    const kv = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
    if (kv) frontmatter[kv[1]!] = kv[2]!.trim();
  }
  return { frontmatter, body: match[2]!.trim() };
}

/**
 * 递归扫描，在 checked 目录中找 SKILL.md，找到则返回其路径，否则继续深入子目录
 */
async function findSkillDirs(
  owner: string,
  repo: string,
  dirPath: string,
  token?: string,
): Promise<string[]> {
  let entries: GitHubEntry[];
  try {
    entries = await fetchJSON<GitHubEntry[]>(
      `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`,
      token,
    );
  } catch {
    return [];
  }

  // 检查本目录有没有 SKILL.md
  const hasMd = entries.some((e) => e.type === 'file' && e.name === 'SKILL.md');
  if (hasMd) {
    // 本目录是一个 skill 根
    return [dirPath];
  }

  // 没有 SKILL.md，递归子目录
  const result: string[] = [];
  const subDirs = entries.filter((e) => e.type === 'dir');
  for (const dir of subDirs) {
    const sub = await findSkillDirs(owner, repo, dir.path, token);
    result.push(...sub);
  }
  return result;
}

/**
 * 递归收集 skillDirPath 下所有文件路径（相对 skillDirPath）
 */
async function collectResourcePaths(
  owner: string,
  repo: string,
  baseDir: string,
  subDir: string,       // 相对于 baseDir 的子路径，顶层为空字符串
  token?: string,
): Promise<string[]> {
  const targetPath = subDir ? `${baseDir}/${subDir}` : baseDir;
  let entries: GitHubEntry[];
  try {
    entries = await fetchJSON<GitHubEntry[]>(
      `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`,
      token,
    );
  } catch {
    return [];
  }

  const result: string[] = [];
  for (const entry of entries) {
    if (entry.type === 'file') {
      result.push(subDir ? `${subDir}/${entry.name}` : entry.name);
    } else if (entry.type === 'dir') {
      const subResult = await collectResourcePaths(
        owner, repo, baseDir,
        subDir ? `${subDir}/${entry.name}` : entry.name,
        token,
      );
      result.push(...subResult);
    }
  }
  return result;
}

export async function fetchSkillsFromGitHub(
  source: string,
  token?: string,
): Promise<ParsedSkill[]> {
  const parsed = parseSource(source);
  if (!parsed) throw new Error(`无法解析 GitHub 地址: ${source}`);

  const { owner, repo } = parsed;
  const skillDirs = await findSkillDirs(owner, repo, 'skills', token);

  const results: ParsedSkill[] = [];
  for (const dirPath of skillDirs) {
    const dirName = dirPath.split('/').pop()!;

    let raw: string;
    try {
      raw = await fetchRawFile(owner, repo, `${dirPath}/SKILL.md`, token);
    } catch {
      continue;
    }

    const { frontmatter, body } = parseSkillMd(raw);
    const name = frontmatter.name || dirName;

    // 收集所有资源文件（含子目录）
    const filePaths = await collectResourcePaths(owner, repo, dirPath, '', token);
    const resources: SkillResource[] = [];
    for (const fp of filePaths) {
      if (fp === 'SKILL.md') continue;
      try {
        const content = await fetchRawFile(owner, repo, `${dirPath}/${fp}`, token);
        resources.push({ path: fp, content });
      } catch {
        // skip
      }
    }

    results.push({
      name,
      description: frontmatter.description || '',
      prompt: body,
      resources,
    });
  }

  return results;
}
