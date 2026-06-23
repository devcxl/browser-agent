import { describe, it, expect } from 'vitest';
import { createSkillTool } from '../skill-tool';

describe('createSkillTool', () => {
  const tool = createSkillTool();

  it('should return a ToolDefinition with correct name', () => {
    expect(tool.name).toBe('skill');
  });

  it('should have expert category', () => {
    expect(tool.category).toBe('expert');
  });

  it('should have low risk level', () => {
    expect(tool.riskLevel).toBe('low');
  });

  it('should not require confirmation', () => {
    expect(tool.confirmationRequired).toBe(false);
  });

  it('should have low result sensitivity', () => {
    expect(tool.resultSensitivity).toBe('low');
  });

  it('should have schema with required name field', () => {
    expect(tool.schema.type).toBe('object');
    expect(tool.schema.properties).toHaveProperty('name');
    expect(tool.schema.required).toContain('name');
  });

  it('should have a description', () => {
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe('string');
  });

  it('should return activated skill name on execute', async () => {
    const result = await tool.execute({ name: 'test-skill' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ activated: 'test-skill' });
  });

  it('should work with any skill name', async () => {
    const result = await tool.execute({ name: 'caveman' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ activated: 'caveman' });
  });
});
