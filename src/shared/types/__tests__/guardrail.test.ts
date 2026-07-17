import { describe, it, expect } from 'vitest';
import type {
  GuardrailContext,
  GuardrailCheck,
  IGuardrail,
} from '../guardrail';

describe('Guardrail types', () => {
  describe('GuardrailContext', () => {
    it('should accept a valid context', () => {
      const ctx: GuardrailContext = {
        isLocalTrusted: false,
        expertModeEnabled: false,
        expertSwitches: {},
        grantedPermissions: [],
        sessionGrants: { sensitiveDataAllowed: false },
      };
      expect(ctx.isLocalTrusted).toBe(false);
    });
  });

  describe('GuardrailCheck', () => {
    it('should define all check fields', () => {
      const check: GuardrailCheck = {
        allowed: true,
        riskLevel: 'low',
        requiresPreflight: false,
        reason: 'OK',
        dataSensitivity: 'low',
      };
      expect(check.allowed).toBe(true);
    });
  });

  describe('IGuardrail', () => {
    it('should define the guardrail interface', () => {
      const guardrail: IGuardrail = {
        check: async () => ({
          allowed: true,
          riskLevel: 'low',
          requiresPreflight: false,
          reason: 'OK',
          dataSensitivity: 'low',
        }),
        filterResultForRemote: (_tool, result) => result,
      };
      expect(typeof guardrail.check).toBe('function');
    });
  });
});
