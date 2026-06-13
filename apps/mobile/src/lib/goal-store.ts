import { useSyncExternalStore } from "react";
import type { ActivityLevel, GoalCalcResult, GoalType, Sex } from "@pashacaro/shared";

/**
 * オンボーディングの目標設定ウィザード(goal/step1 -> step2 -> result)の
 * 入力途中の状態を保持するモジュールスコープストア。
 *
 * 画面遷移をまたいで参照できるよう、analysis-store.ts と同様のシンプルな実装。
 */

export interface GoalDraft {
  goalType: GoalType | null;
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

interface GoalStoreState {
  draft: GoalDraft;
  /** result.tsx で計算・微調整した最終結果(PUT /v1/me/goal に送る直前の値) */
  calculated: GoalCalcResult | null;
}

const initialDraft: GoalDraft = {
  goalType: null,
  sex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};

let state: GoalStoreState = {
  draft: { ...initialDraft },
  calculated: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGoalStoreState(): GoalStoreState {
  return state;
}

export function useGoalStore(): GoalStoreState {
  return useSyncExternalStore(subscribe, getGoalStoreState, getGoalStoreState);
}

export function setGoalType(goalType: GoalType): void {
  state = { ...state, draft: { ...state.draft, goalType } };
  emit();
}

export function setGoalProfile(input: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}): void {
  state = { ...state, draft: { ...state.draft, ...input } };
  emit();
}

export function setCalculatedGoal(calculated: GoalCalcResult | null): void {
  state = { ...state, calculated };
  emit();
}

/** 入力が完了しているか(goal-calc呼び出しに必要な値が揃っているか) */
export function isDraftComplete(draft: GoalDraft): draft is {
  goalType: GoalType;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
} {
  return (
    draft.goalType !== null &&
    draft.sex !== null &&
    draft.age !== null &&
    draft.heightCm !== null &&
    draft.weightKg !== null &&
    draft.activityLevel !== null
  );
}

/** テスト・開発用にストアをリセットする */
export function _resetGoalStore(): void {
  state = { draft: { ...initialDraft }, calculated: null };
  emit();
}
