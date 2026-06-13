import { useSyncExternalStore } from "react";
import type { CorrectedAnalysis, Analysis } from "@pashacaro/shared";

/**
 * M1向けの最小限のローカル状態管理。
 *
 * DB接続が無いため、「最後の解析結果」と「記録済み食事(ローカルのみ)」を
 * メモリ上に保持するだけのシンプルなストア。
 * 画面遷移をまたいで参照できるよう、モジュールスコープのシングルトンとして実装する。
 */

export type StoredAnalysis = CorrectedAnalysis | Analysis;

export interface RecordedMeal {
  id: string;
  recordedAt: string; // ISO8601
  analysis: StoredAnalysis;
  /** dishごとの分量スケール(0.5〜2.0) */
  portionScales: number[];
}

interface AnalysisStoreState {
  lastAnalysis: StoredAnalysis | null;
  /** 直前の解析リクエストの analysis_logs.id (POST /v1/meals の analysisLogId に渡す) */
  lastAnalysisLogId: number | null;
  /** 直前の解析の入力種別。POST /v1/meals の source に渡す。 */
  lastAnalysisSource: "photo" | "text" | null;
  recordedMeals: RecordedMeal[];
}

let state: AnalysisStoreState = {
  lastAnalysis: null,
  lastAnalysisLogId: null,
  lastAnalysisSource: null,
  recordedMeals: [],
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setLastAnalysis(
  analysis: StoredAnalysis | null,
  meta?: { analysisLogId?: number | null; source?: "photo" | "text" | null },
): void {
  state = {
    ...state,
    lastAnalysis: analysis,
    lastAnalysisLogId: meta?.analysisLogId ?? (analysis === null ? null : state.lastAnalysisLogId),
    lastAnalysisSource: meta?.source ?? (analysis === null ? null : state.lastAnalysisSource),
  };
  emit();
}

export function recordMeal(meal: RecordedMeal): void {
  state = { ...state, recordedMeals: [meal, ...state.recordedMeals] };
  emit();
}

export function getAnalysisStoreState(): AnalysisStoreState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactコンポーネントから現在の状態を購読するためのフック */
export function useAnalysisStore(): AnalysisStoreState {
  return useSyncExternalStore(subscribe, getAnalysisStoreState, getAnalysisStoreState);
}

/** テスト・開発用にストアをリセットする */
export function _resetAnalysisStore(): void {
  state = {
    lastAnalysis: null,
    lastAnalysisLogId: null,
    lastAnalysisSource: null,
    recordedMeals: [],
  };
  emit();
}
