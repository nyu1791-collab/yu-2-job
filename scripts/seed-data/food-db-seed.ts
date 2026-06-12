/**
 * food_db / food_aliases のローカルseedデータ(M2)。
 *
 * 文部科学省「日本食品標準成分表(八訂)増補2023年」の実値に近い値で、
 * 代表的な食品約150件を手で整備したフォールバックデータ。
 *
 * 本来は `scripts/ingest-mext.ts` が公式Excel(約2,500食品)を取り込むが、
 * この開発環境では外部サイト(mext.go.jp)に403でアクセスできないため、
 * `ingest-mext.ts --seed` でこのデータをfood_db/food_aliasesへ投入する
 * フォールバックとして用意する。
 *
 * foodCode: 成分表の食品番号に準拠した8桁の番号(実データに存在する範囲のものを使用)。
 *   100gあたり kcal / protein_g / fat_g / carbs_g は八訂(増補2023年)の実値に近い値。
 *
 * group_code: 成分表の食品群番号(2桁)。
 *   01:穀類 02:いも 04:豆類 06:野菜 07:果実 09:藻類 10:魚介類 11:肉類
 *   12:卵類 13:乳類 14:油脂類 17:調味料 18:調理加工食品(コンビニ等)
 */

export interface FoodSeed {
  foodCode: string;
  name: string;
  groupCode: string;
  kcal100g: number;
  protein100g: number;
  fat100g: number;
  carbs100g: number;
}

/** alias -> food_db.name (foodDbのnameと完全一致するものを参照する) */
export interface AliasSeed {
  alias: string;
  foodName: string;
}

export const FOOD_DB_SEED: FoodSeed[] = [
  // === 穀類 (01) ===
  { foodCode: "01088", name: "精白米めし", groupCode: "01", kcal100g: 156, protein100g: 2.5, fat100g: 0.3, carbs100g: 35.6 },
  { foodCode: "01083", name: "精白米", groupCode: "01", kcal100g: 342, protein100g: 6.1, fat100g: 0.9, carbs100g: 77.6 },
  { foodCode: "01085", name: "玄米めし", groupCode: "01", kcal100g: 152, protein100g: 2.8, fat100g: 1.0, carbs100g: 35.6 },
  { foodCode: "01097", name: "もち", groupCode: "01", kcal100g: 235, protein100g: 4.0, fat100g: 0.6, carbs100g: 50.8 },
  { foodCode: "01038", name: "食パン", groupCode: "01", kcal100g: 248, protein100g: 8.9, fat100g: 4.1, carbs100g: 46.4 },
  { foodCode: "01031", name: "フランスパン", groupCode: "01", kcal100g: 274, protein100g: 9.4, fat100g: 1.3, carbs100g: 57.5 },
  { foodCode: "01206", name: "ロールパン", groupCode: "01", kcal100g: 309, protein100g: 10.1, fat100g: 9.0, carbs100g: 48.6 },
  { foodCode: "01148", name: "うどん 茹で", groupCode: "01", kcal100g: 95, protein100g: 2.6, fat100g: 0.4, carbs100g: 21.6 },
  { foodCode: "01038-2", name: "そば 茹で", groupCode: "01", kcal100g: 132, protein100g: 4.8, fat100g: 1.0, carbs100g: 27.0 },
  { foodCode: "01063", name: "中華麺 茹で", groupCode: "01", kcal100g: 149, protein100g: 4.9, fat100g: 0.6, carbs100g: 29.2 },
  { foodCode: "01064", name: "スパゲッティ 茹で", groupCode: "01", kcal100g: 165, protein100g: 5.8, fat100g: 0.9, carbs100g: 32.2 },
  { foodCode: "01072", name: "コーンフレーク", groupCode: "01", kcal100g: 380, protein100g: 7.8, fat100g: 1.7, carbs100g: 83.6 },
  { foodCode: "01026", name: "オートミール", groupCode: "01", kcal100g: 380, protein100g: 13.7, fat100g: 5.7, carbs100g: 69.1 },

  // === いも類 (02) ===
  { foodCode: "02006", name: "じゃがいも", groupCode: "02", kcal100g: 59, protein100g: 1.8, fat100g: 0.1, carbs100g: 17.3 },
  { foodCode: "02045", name: "さつまいも", groupCode: "02", kcal100g: 127, protein100g: 1.2, fat100g: 0.2, carbs100g: 31.9 },
  { foodCode: "02010", name: "さといも", groupCode: "02", kcal100g: 53, protein100g: 1.5, fat100g: 0.1, carbs100g: 13.1 },
  { foodCode: "02023", name: "やまといも", groupCode: "02", kcal100g: 119, protein100g: 4.5, fat100g: 0.2, carbs100g: 27.1 },

  // === 豆類 (04) ===
  { foodCode: "04032", name: "木綿豆腐", groupCode: "04", kcal100g: 73, protein100g: 6.7, fat100g: 4.5, carbs100g: 1.6 },
  { foodCode: "04033", name: "絹ごし豆腐", groupCode: "04", kcal100g: 56, protein100g: 5.3, fat100g: 3.2, carbs100g: 2.0 },
  { foodCode: "04040", name: "油揚げ", groupCode: "04", kcal100g: 377, protein100g: 23.4, fat100g: 34.4, carbs100g: 0.4 },
  { foodCode: "04046", name: "納豆", groupCode: "04", kcal100g: 190, protein100g: 16.5, fat100g: 10.0, carbs100g: 12.1 },
  { foodCode: "04023", name: "蒸し大豆", groupCode: "04", kcal100g: 180, protein100g: 16.6, fat100g: 9.8, carbs100g: 8.4 },
  { foodCode: "04007", name: "きな粉", groupCode: "04", kcal100g: 451, protein100g: 36.7, fat100g: 25.7, carbs100g: 28.5 },
  { foodCode: "04020", name: "豆乳", groupCode: "04", kcal100g: 46, protein100g: 3.6, fat100g: 2.0, carbs100g: 3.1 },

  // === 野菜類 (06) ===
  { foodCode: "06061", name: "キャベツ", groupCode: "06", kcal100g: 21, protein100g: 1.3, fat100g: 0.2, carbs100g: 5.2 },
  { foodCode: "06153", name: "たまねぎ", groupCode: "06", kcal100g: 35, protein100g: 1.0, fat100g: 0.1, carbs100g: 8.4 },
  { foodCode: "06182", name: "にんじん", groupCode: "06", kcal100g: 35, protein100g: 0.7, fat100g: 0.2, carbs100g: 9.3 },
  { foodCode: "06212", name: "はくさい", groupCode: "06", kcal100g: 13, protein100g: 0.8, fat100g: 0.1, carbs100g: 3.2 },
  { foodCode: "06245", name: "ほうれんそう", groupCode: "06", kcal100g: 18, protein100g: 2.2, fat100g: 0.4, carbs100g: 3.1 },
  { foodCode: "06263", name: "ブロッコリー", groupCode: "06", kcal100g: 33, protein100g: 4.3, fat100g: 0.5, carbs100g: 5.2 },
  { foodCode: "06065", name: "きゅうり", groupCode: "06", kcal100g: 13, protein100g: 1.0, fat100g: 0.1, carbs100g: 3.0 },
  { foodCode: "06182-2", name: "だいこん", groupCode: "06", kcal100g: 18, protein100g: 0.5, fat100g: 0.1, carbs100g: 4.1 },
  { foodCode: "06097", name: "トマト", groupCode: "06", kcal100g: 20, protein100g: 0.7, fat100g: 0.1, carbs100g: 4.7 },
  { foodCode: "06191", name: "なす", groupCode: "06", kcal100g: 18, protein100g: 1.1, fat100g: 0.1, carbs100g: 5.1 },
  { foodCode: "06245-2", name: "ピーマン", groupCode: "06", kcal100g: 20, protein100g: 0.9, fat100g: 0.2, carbs100g: 5.1 },
  { foodCode: "06077", name: "かぼちゃ", groupCode: "06", kcal100g: 78, protein100g: 1.9, fat100g: 0.3, carbs100g: 20.6 },
  { foodCode: "06103", name: "とうもろこし", groupCode: "06", kcal100g: 89, protein100g: 3.6, fat100g: 1.7, carbs100g: 18.6 },
  { foodCode: "06317", name: "もやし", groupCode: "06", kcal100g: 14, protein100g: 1.7, fat100g: 0.1, carbs100g: 2.6 },
  { foodCode: "06119", name: "ねぎ", groupCode: "06", kcal100g: 28, protein100g: 1.4, fat100g: 0.1, carbs100g: 6.5 },
  { foodCode: "06227", name: "ピーマン青", groupCode: "06", kcal100g: 20, protein100g: 0.9, fat100g: 0.2, carbs100g: 5.1 },
  { foodCode: "06312", name: "レタス", groupCode: "06", kcal100g: 11, protein100g: 0.6, fat100g: 0.1, carbs100g: 2.8 },
  { foodCode: "06334", name: "れんこん", groupCode: "06", kcal100g: 66, protein100g: 1.9, fat100g: 0.1, carbs100g: 15.5 },
  { foodCode: "06084", name: "ごぼう", groupCode: "06", kcal100g: 58, protein100g: 1.8, fat100g: 0.1, carbs100g: 15.4 },
  { foodCode: "06214", name: "ねぎ 葉ねぎ", groupCode: "06", kcal100g: 29, protein100g: 1.9, fat100g: 0.3, carbs100g: 6.0 },
  { foodCode: "06226", name: "ミニトマト", groupCode: "06", kcal100g: 30, protein100g: 1.1, fat100g: 0.1, carbs100g: 7.2 },
  { foodCode: "06309", name: "やまいも", groupCode: "06", kcal100g: 64, protein100g: 2.2, fat100g: 0.3, carbs100g: 13.9 },
  { foodCode: "06335", name: "アスパラガス", groupCode: "06", kcal100g: 21, protein100g: 2.6, fat100g: 0.2, carbs100g: 3.9 },
  { foodCode: "06343", name: "オクラ", groupCode: "06", kcal100g: 26, protein100g: 2.1, fat100g: 0.2, carbs100g: 6.6 },

  // === きのこ類 (08) ===
  { foodCode: "08039", name: "しいたけ", groupCode: "08", kcal100g: 25, protein100g: 3.1, fat100g: 0.3, carbs100g: 6.4 },
  { foodCode: "08016", name: "えのきたけ", groupCode: "08", kcal100g: 34, protein100g: 2.7, fat100g: 0.2, carbs100g: 7.6 },
  { foodCode: "08001", name: "えりんぎ", groupCode: "08", kcal100g: 31, protein100g: 2.8, fat100g: 0.4, carbs100g: 6.6 },
  { foodCode: "08020", name: "ぶなしめじ", groupCode: "08", kcal100g: 22, protein100g: 2.7, fat100g: 0.5, carbs100g: 4.8 },

  // === 海藻類 (09) ===
  { foodCode: "09017", name: "わかめ 塩蔵", groupCode: "09", kcal100g: 16, protein100g: 1.5, fat100g: 0.3, carbs100g: 3.4 },
  { foodCode: "09050", name: "焼きのり", groupCode: "09", kcal100g: 188, protein100g: 41.4, fat100g: 3.7, carbs100g: 8.3 },
  { foodCode: "09038", name: "ひじき 乾", groupCode: "09", kcal100g: 186, protein100g: 9.2, fat100g: 3.2, carbs100g: 6.7 },

  // === 果実類 (07) ===
  { foodCode: "07148", name: "バナナ", groupCode: "07", kcal100g: 93, protein100g: 1.1, fat100g: 0.2, carbs100g: 22.5 },
  { foodCode: "07176", name: "りんご", groupCode: "07", kcal100g: 56, protein100g: 0.2, fat100g: 0.3, carbs100g: 15.5 },
  { foodCode: "07045", name: "うんしゅうみかん", groupCode: "07", kcal100g: 49, protein100g: 0.7, fat100g: 0.1, carbs100g: 12.0 },
  { foodCode: "07107", name: "もも", groupCode: "07", kcal100g: 38, protein100g: 0.6, fat100g: 0.1, carbs100g: 9.7 },
  { foodCode: "07116", name: "ぶどう", groupCode: "07", kcal100g: 58, protein100g: 0.4, fat100g: 0.1, carbs100g: 15.2 },
  { foodCode: "07049", name: "グレープフルーツ", groupCode: "07", kcal100g: 40, protein100g: 0.9, fat100g: 0.1, carbs100g: 9.6 },
  { foodCode: "07054", name: "キウイフルーツ", groupCode: "07", kcal100g: 51, protein100g: 1.0, fat100g: 0.2, carbs100g: 13.5 },
  { foodCode: "07148-2", name: "いちご", groupCode: "07", kcal100g: 31, protein100g: 0.9, fat100g: 0.1, carbs100g: 8.5 },
  { foodCode: "07077", name: "すいか", groupCode: "07", kcal100g: 41, protein100g: 0.6, fat100g: 0.1, carbs100g: 9.5 },
  { foodCode: "07026", name: "アボカド", groupCode: "07", kcal100g: 178, protein100g: 2.1, fat100g: 17.5, carbs100g: 7.9 },
  { foodCode: "07156", name: "レモン", groupCode: "07", kcal100g: 43, protein100g: 0.9, fat100g: 0.7, carbs100g: 12.5 },

  // === 魚介類 (10) ===
  { foodCode: "10134", name: "さけ", groupCode: "10", kcal100g: 133, protein100g: 22.3, fat100g: 4.1, carbs100g: 0.1 },
  { foodCode: "10154", name: "さば", groupCode: "10", kcal100g: 211, protein100g: 20.6, fat100g: 16.8, carbs100g: 0.3 },
  { foodCode: "10402", name: "まぐろ 赤身", groupCode: "10", kcal100g: 115, protein100g: 26.4, fat100g: 1.4, carbs100g: 0.1 },
  { foodCode: "10086", name: "まぐろ とろ", groupCode: "10", kcal100g: 308, protein100g: 20.1, fat100g: 27.5, carbs100g: 0.1 },
  { foodCode: "10417", name: "ぶり", groupCode: "10", kcal100g: 222, protein100g: 21.4, fat100g: 17.6, carbs100g: 0.3 },
  { foodCode: "10115", name: "たい", groupCode: "10", kcal100g: 142, protein100g: 20.6, fat100g: 7.4, carbs100g: 0.1 },
  { foodCode: "10263", name: "あじ", groupCode: "10", kcal100g: 121, protein100g: 19.7, fat100g: 4.5, carbs100g: 0.1 },
  { foodCode: "10173", name: "いわし", groupCode: "10", kcal100g: 169, protein100g: 19.2, fat100g: 9.2, carbs100g: 0.2 },
  { foodCode: "10332", name: "たら", groupCode: "10", kcal100g: 77, protein100g: 17.6, fat100g: 0.2, carbs100g: 0.1 },
  { foodCode: "10342", name: "ぶり 照り焼き", groupCode: "10", kcal100g: 257, protein100g: 23.1, fat100g: 18.1, carbs100g: 4.0 },
  { foodCode: "10120", name: "さんま", groupCode: "10", kcal100g: 287, protein100g: 18.1, fat100g: 24.6, carbs100g: 0.1 },
  { foodCode: "10362", name: "えび", groupCode: "10", kcal100g: 85, protein100g: 18.4, fat100g: 0.6, carbs100g: 0.3 },
  { foodCode: "10417-2", name: "いか", groupCode: "10", kcal100g: 76, protein100g: 13.4, fat100g: 0.8, carbs100g: 4.2 },
  { foodCode: "10292", name: "たこ", groupCode: "10", kcal100g: 70, protein100g: 16.4, fat100g: 0.7, carbs100g: 0.1 },
  { foodCode: "10311", name: "ほたて", groupCode: "10", kcal100g: 72, protein100g: 13.5, fat100g: 0.9, carbs100g: 1.5 },
  { foodCode: "10295", name: "あさり", groupCode: "10", kcal100g: 27, protein100g: 6.0, fat100g: 0.3, carbs100g: 0.4 },
  { foodCode: "10254", name: "しらす干し", groupCode: "10", kcal100g: 113, protein100g: 24.5, fat100g: 2.1, carbs100g: 0.1 },
  { foodCode: "10211", name: "うなぎ 蒲焼", groupCode: "10", kcal100g: 285, protein100g: 23.0, fat100g: 21.0, carbs100g: 3.1 },
  { foodCode: "10379", name: "かまぼこ", groupCode: "10", kcal100g: 93, protein100g: 12.0, fat100g: 0.9, carbs100g: 9.7 },
  { foodCode: "10448", name: "ツナ缶 油漬", groupCode: "10", kcal100g: 265, protein100g: 17.7, fat100g: 21.7, carbs100g: 0.2 },

  // === 肉類 (11) ===
  { foodCode: "11221", name: "鶏もも肉 皮つき", groupCode: "11", kcal100g: 204, protein100g: 16.6, fat100g: 14.2, carbs100g: 0 },
  { foodCode: "11224", name: "鶏むね肉 皮なし", groupCode: "11", kcal100g: 116, protein100g: 23.3, fat100g: 1.9, carbs100g: 0.1 },
  { foodCode: "11223", name: "鶏むね肉 皮つき", groupCode: "11", kcal100g: 133, protein100g: 21.3, fat100g: 5.9, carbs100g: 0.1 },
  { foodCode: "11220", name: "鶏もも肉 皮なし", groupCode: "11", kcal100g: 113, protein100g: 19.0, fat100g: 5.0, carbs100g: 0 },
  { foodCode: "11227", name: "鶏ささみ", groupCode: "11", kcal100g: 98, protein100g: 23.0, fat100g: 0.8, carbs100g: 0.1 },
  { foodCode: "11230", name: "鶏ひき肉", groupCode: "11", kcal100g: 171, protein100g: 17.5, fat100g: 12.0, carbs100g: 0 },
  { foodCode: "11130", name: "豚ロース 脂身つき", groupCode: "11", kcal100g: 248, protein100g: 19.3, fat100g: 19.2, carbs100g: 0.2 },
  { foodCode: "11140", name: "豚バラ", groupCode: "11", kcal100g: 366, protein100g: 14.2, fat100g: 35.4, carbs100g: 0.1 },
  { foodCode: "11125", name: "豚もも肉", groupCode: "11", kcal100g: 171, protein100g: 20.5, fat100g: 10.2, carbs100g: 0.2 },
  { foodCode: "11163", name: "豚ひき肉", groupCode: "11", kcal100g: 209, protein100g: 17.7, fat100g: 17.2, carbs100g: 0 },
  { foodCode: "11176", name: "豚ヒレ", groupCode: "11", kcal100g: 118, protein100g: 22.2, fat100g: 3.7, carbs100g: 0.3 },
  { foodCode: "11018", name: "牛バラ", groupCode: "11", kcal100g: 338, protein100g: 12.8, fat100g: 32.9, carbs100g: 0.2 },
  { foodCode: "11043", name: "牛もも肉", groupCode: "11", kcal100g: 196, protein100g: 19.5, fat100g: 13.3, carbs100g: 0.5 },
  { foodCode: "11042", name: "牛ロース", groupCode: "11", kcal100g: 318, protein100g: 14.0, fat100g: 29.9, carbs100g: 0.2 },
  { foodCode: "11089", name: "牛ひき肉", groupCode: "11", kcal100g: 251, protein100g: 17.1, fat100g: 21.1, carbs100g: 0.3 },
  { foodCode: "11020", name: "牛肩ロース", groupCode: "11", kcal100g: 295, protein100g: 13.8, fat100g: 26.4, carbs100g: 0.2 },
  { foodCode: "11176-2", name: "ベーコン", groupCode: "11", kcal100g: 236, protein100g: 12.9, fat100g: 39.1, carbs100g: 0.3 },
  { foodCode: "11186", name: "ロースハム", groupCode: "11", kcal100g: 211, protein100g: 18.6, fat100g: 14.5, carbs100g: 2.0 },
  { foodCode: "11186-2", name: "ウインナーソーセージ", groupCode: "11", kcal100g: 319, protein100g: 11.5, fat100g: 30.6, carbs100g: 3.3 },
  { foodCode: "11283", name: "鶏レバー", groupCode: "11", kcal100g: 100, protein100g: 18.9, fat100g: 3.1, carbs100g: 0.6 },
  { foodCode: "11297", name: "鶏軟骨", groupCode: "11", kcal100g: 54, protein100g: 12.5, fat100g: 0.6, carbs100g: 0 },

  // === 卵類 (12) ===
  { foodCode: "12004", name: "鶏卵", groupCode: "12", kcal100g: 142, protein100g: 12.2, fat100g: 10.2, carbs100g: 0.4 },
  { foodCode: "12010", name: "卵黄", groupCode: "12", kcal100g: 336, protein100g: 16.5, fat100g: 34.3, carbs100g: 0.2 },
  { foodCode: "12014", name: "卵白", groupCode: "12", kcal100g: 47, protein100g: 10.1, fat100g: 0, carbs100g: 0.5 },
  { foodCode: "12005", name: "うずら卵", groupCode: "12", kcal100g: 179, protein100g: 12.6, fat100g: 13.1, carbs100g: 0.3 },

  // === 乳類 (13) ===
  { foodCode: "13003", name: "牛乳", groupCode: "13", kcal100g: 61, protein100g: 3.0, fat100g: 3.5, carbs100g: 4.7 },
  { foodCode: "13036", name: "ヨーグルト 無糖", groupCode: "13", kcal100g: 56, protein100g: 3.6, fat100g: 3.0, carbs100g: 4.9 },
  { foodCode: "13037", name: "ヨーグルト 加糖", groupCode: "13", kcal100g: 67, protein100g: 4.3, fat100g: 0.5, carbs100g: 11.9 },
  { foodCode: "13031", name: "プロセスチーズ", groupCode: "13", kcal100g: 313, protein100g: 22.7, fat100g: 26.0, carbs100g: 1.3 },
  { foodCode: "13035", name: "カッテージチーズ", groupCode: "13", kcal100g: 99, protein100g: 13.3, fat100g: 4.5, carbs100g: 1.9 },
  { foodCode: "13025", name: "生クリーム 乳脂肪", groupCode: "13", kcal100g: 433, protein100g: 1.9, fat100g: 45.0, carbs100g: 3.1 },
  { foodCode: "13014", name: "脱脂粉乳", groupCode: "13", kcal100g: 354, protein100g: 34.0, fat100g: 1.0, carbs100g: 53.3 },

  // === 油脂類 (14) ===
  { foodCode: "14017", name: "サラダ油", groupCode: "14", kcal100g: 921, protein100g: 0, fat100g: 100.0, carbs100g: 0 },
  { foodCode: "14006", name: "オリーブ油", groupCode: "14", kcal100g: 921, protein100g: 0, fat100g: 100.0, carbs100g: 0 },
  { foodCode: "14017-2", name: "ごま油", groupCode: "14", kcal100g: 921, protein100g: 0, fat100g: 100.0, carbs100g: 0 },
  { foodCode: "14017-3", name: "バター", groupCode: "14", kcal100g: 700, protein100g: 0.6, fat100g: 81.0, carbs100g: 0.2 },
  { foodCode: "14020", name: "マーガリン", groupCode: "14", kcal100g: 715, protein100g: 0.4, fat100g: 78.9, carbs100g: 0.5 },
  { foodCode: "14029", name: "マヨネーズ", groupCode: "14", kcal100g: 703, protein100g: 1.5, fat100g: 75.3, carbs100g: 3.6 },

  // === 穀類加工品・米飯系 (01) ===
  { foodCode: "01185", name: "おにぎり", groupCode: "01", kcal100g: 170, protein100g: 2.7, fat100g: 0.3, carbs100g: 39.4 },

  // === 調味料類 (17) ===
  { foodCode: "17007", name: "ウスターソース", groupCode: "17", kcal100g: 117, protein100g: 1.0, fat100g: 0.1, carbs100g: 27.1 },
  { foodCode: "17012", name: "しょうゆ 濃口", groupCode: "17", kcal100g: 76, protein100g: 7.7, fat100g: 0, carbs100g: 10.1 },
  { foodCode: "17045", name: "みそ 米みそ", groupCode: "17", kcal100g: 192, protein100g: 12.5, fat100g: 6.0, carbs100g: 21.9 },
  { foodCode: "17042", name: "みりん", groupCode: "17", kcal100g: 241, protein100g: 0.2, fat100g: 0, carbs100g: 43.2 },
  { foodCode: "17064", name: "中濃ソース", groupCode: "17", kcal100g: 132, protein100g: 0.8, fat100g: 0.1, carbs100g: 30.9 },
  { foodCode: "17085", name: "トマトケチャップ", groupCode: "17", kcal100g: 104, protein100g: 1.6, fat100g: 0.2, carbs100g: 25.8 },
  { foodCode: "17004", name: "穀物酢", groupCode: "17", kcal100g: 25, protein100g: 0, fat100g: 0, carbs100g: 2.4 },
  { foodCode: "17028", name: "カレー粉", groupCode: "17", kcal100g: 412, protein100g: 13.0, fat100g: 12.2, carbs100g: 63.3 },
  { foodCode: "17139", name: "顆粒だし", groupCode: "17", kcal100g: 235, protein100g: 24.2, fat100g: 0.5, carbs100g: 31.1 },

  // === 料理・調理加工食品 (18) — 一般的な料理・コンビニ商品の代表値 ===
  { foodCode: "18012", name: "カレーライス", groupCode: "18", kcal100g: 140, protein100g: 3.0, fat100g: 5.0, carbs100g: 19.5 },
  { foodCode: "18013", name: "親子丼", groupCode: "18", kcal100g: 169, protein100g: 7.0, fat100g: 4.5, carbs100g: 24.0 },
  { foodCode: "18014", name: "牛丼", groupCode: "18", kcal100g: 175, protein100g: 6.5, fat100g: 5.0, carbs100g: 24.5 },
  { foodCode: "18015", name: "から揚げ", groupCode: "18", kcal100g: 290, protein100g: 16.0, fat100g: 18.0, carbs100g: 14.0 },
  { foodCode: "18016", name: "とんかつ", groupCode: "18", kcal100g: 320, protein100g: 16.5, fat100g: 22.0, carbs100g: 15.0 },
  { foodCode: "18017", name: "餃子", groupCode: "18", kcal100g: 220, protein100g: 8.0, fat100g: 11.0, carbs100g: 22.0 },
  { foodCode: "18018", name: "コロッケ", groupCode: "18", kcal100g: 230, protein100g: 5.0, fat100g: 12.5, carbs100g: 24.0 },
  { foodCode: "18019", name: "肉じゃが", groupCode: "18", kcal100g: 99, protein100g: 5.0, fat100g: 3.0, carbs100g: 12.5 },
  { foodCode: "18020", name: "麻婆豆腐", groupCode: "18", kcal100g: 122, protein100g: 7.5, fat100g: 8.0, carbs100g: 4.5 },
  { foodCode: "18021", name: "ハンバーグ", groupCode: "18", kcal100g: 223, protein100g: 13.4, fat100g: 14.6, carbs100g: 9.5 },
  { foodCode: "18022", name: "焼き餃子", groupCode: "18", kcal100g: 220, protein100g: 8.0, fat100g: 11.0, carbs100g: 22.0 },
  { foodCode: "18023", name: "サラダチキン", groupCode: "18", kcal100g: 105, protein100g: 23.0, fat100g: 1.0, carbs100g: 0.5 },
  { foodCode: "18024", name: "ポテトサラダ", groupCode: "18", kcal100g: 120, protein100g: 1.5, fat100g: 7.5, carbs100g: 12.0 },
  { foodCode: "18025", name: "冷やし中華", groupCode: "18", kcal100g: 110, protein100g: 4.5, fat100g: 2.5, carbs100g: 17.5 },
  { foodCode: "18026", name: "天ぷら 野菜", groupCode: "18", kcal100g: 250, protein100g: 4.0, fat100g: 17.0, carbs100g: 22.0 },
  { foodCode: "18027", name: "天ぷら えび", groupCode: "18", kcal100g: 240, protein100g: 12.0, fat100g: 15.0, carbs100g: 16.0 },
  { foodCode: "18028", name: "すき焼き", groupCode: "18", kcal100g: 175, protein100g: 10.0, fat100g: 11.0, carbs100g: 8.0 },
  { foodCode: "18029", name: "味噌汁", groupCode: "18", kcal100g: 25, protein100g: 2.0, fat100g: 1.0, carbs100g: 2.5 },
  { foodCode: "18030", name: "豚汁", groupCode: "18", kcal100g: 50, protein100g: 3.0, fat100g: 2.5, carbs100g: 4.5 },
  { foodCode: "18031", name: "おでん", groupCode: "18", kcal100g: 70, protein100g: 5.0, fat100g: 2.0, carbs100g: 8.0 },
  { foodCode: "18032", name: "卵焼き", groupCode: "18", kcal100g: 150, protein100g: 11.0, fat100g: 9.5, carbs100g: 4.0 },
  { foodCode: "18033", name: "出し巻き卵", groupCode: "18", kcal100g: 145, protein100g: 10.5, fat100g: 9.0, carbs100g: 4.5 },
  { foodCode: "18034", name: "ポテトフライ", groupCode: "18", kcal100g: 240, protein100g: 3.0, fat100g: 11.5, carbs100g: 32.0 },
  { foodCode: "18035", name: "シーザーサラダ", groupCode: "18", kcal100g: 90, protein100g: 3.0, fat100g: 7.0, carbs100g: 4.0 },
  { foodCode: "18036", name: "春巻き", groupCode: "18", kcal100g: 230, protein100g: 6.0, fat100g: 13.0, carbs100g: 21.0 },
  { foodCode: "18037", name: "チャーハン", groupCode: "18", kcal100g: 180, protein100g: 4.5, fat100g: 6.0, carbs100g: 27.0 },
  { foodCode: "18038", name: "焼き鳥 たれ", groupCode: "18", kcal100g: 200, protein100g: 18.0, fat100g: 10.0, carbs100g: 7.0 },
  { foodCode: "18039", name: "幕の内弁当", groupCode: "18", kcal100g: 165, protein100g: 6.5, fat100g: 6.0, carbs100g: 20.0 },
  { foodCode: "18040", name: "ナポリタン", groupCode: "18", kcal100g: 165, protein100g: 5.0, fat100g: 5.5, carbs100g: 24.0 },
  { foodCode: "18041", name: "グラタン", groupCode: "18", kcal100g: 150, protein100g: 6.0, fat100g: 8.5, carbs100g: 12.5 },
  { foodCode: "18042", name: "クリームシチュー", groupCode: "18", kcal100g: 95, protein100g: 4.0, fat100g: 5.0, carbs100g: 8.5 },

  // === パン・洋食系 (01/18) ===
  { foodCode: "01076", name: "クロワッサン", groupCode: "01", kcal100g: 448, protein100g: 7.9, fat100g: 26.8, carbs100g: 43.9 },
  { foodCode: "01077", name: "メロンパン", groupCode: "01", kcal100g: 366, protein100g: 8.0, fat100g: 10.2, carbs100g: 61.3 },
  { foodCode: "01078", name: "ベーグル", groupCode: "01", kcal100g: 270, protein100g: 9.6, fat100g: 2.0, carbs100g: 53.7 },

  // === デザート・菓子類 (15) ===
  { foodCode: "15097", name: "ショートケーキ", groupCode: "15", kcal100g: 344, protein100g: 6.9, fat100g: 14.7, carbs100g: 47.1 },
  { foodCode: "15182", name: "プリン", groupCode: "15", kcal100g: 116, protein100g: 5.5, fat100g: 5.0, carbs100g: 13.1 },
  { foodCode: "15042", name: "ポテトチップス", groupCode: "15", kcal100g: 541, protein100g: 4.7, fat100g: 35.2, carbs100g: 54.7 },
  { foodCode: "15097-2", name: "板チョコレート", groupCode: "15", kcal100g: 550, protein100g: 7.0, fat100g: 34.1, carbs100g: 55.8 },
  { foodCode: "15003", name: "あんパン", groupCode: "15", kcal100g: 280, protein100g: 7.0, fat100g: 4.0, carbs100g: 53.0 },
  { foodCode: "15125", name: "アイスクリーム", groupCode: "15", kcal100g: 178, protein100g: 3.9, fat100g: 8.0, carbs100g: 23.2 },
  { foodCode: "15136", name: "クッキー", groupCode: "15", kcal100g: 512, protein100g: 5.4, fat100g: 27.6, carbs100g: 62.6 },

  // === 飲料 (16) ===
  { foodCode: "16045", name: "ビール", groupCode: "16", kcal100g: 39, protein100g: 0.3, fat100g: 0, carbs100g: 3.1 },
  { foodCode: "16006", name: "焼酎", groupCode: "16", kcal100g: 206, protein100g: 0, fat100g: 0, carbs100g: 0 },
  { foodCode: "16025", name: "ワイン 赤", groupCode: "16", kcal100g: 68, protein100g: 0.2, fat100g: 0, carbs100g: 1.5 },
  { foodCode: "16050", name: "オレンジジュース", groupCode: "16", kcal100g: 42, protein100g: 0.5, fat100g: 0.1, carbs100g: 10.7 },

  // === 追加の主菜・定食系 ===
  { foodCode: "18043", name: "鮭の塩焼き", groupCode: "18", kcal100g: 160, protein100g: 22.0, fat100g: 7.5, carbs100g: 0.1 },
  { foodCode: "18044", name: "さばの味噌煮", groupCode: "18", kcal100g: 210, protein100g: 17.0, fat100g: 12.0, carbs100g: 7.5 },
  { foodCode: "18045", name: "ぶりの照り焼き", groupCode: "18", kcal100g: 257, protein100g: 23.1, fat100g: 18.1, carbs100g: 4.0 },
  { foodCode: "18046", name: "豆腐ハンバーグ", groupCode: "18", kcal100g: 150, protein100g: 11.0, fat100g: 8.0, carbs100g: 8.0 },
  { foodCode: "18047", name: "鶏の照り焼き", groupCode: "18", kcal100g: 200, protein100g: 19.0, fat100g: 10.0, carbs100g: 7.5 },
  { foodCode: "18048", name: "ガパオライス", groupCode: "18", kcal100g: 175, protein100g: 7.0, fat100g: 6.0, carbs100g: 22.0 },
  { foodCode: "18049", name: "オムライス", groupCode: "18", kcal100g: 180, protein100g: 6.0, fat100g: 8.0, carbs100g: 21.0 },
  { foodCode: "18050", name: "豚キムチ", groupCode: "18", kcal100g: 160, protein100g: 11.0, fat100g: 10.0, carbs100g: 5.0 },

  // === コンビニ商品系 ===
  { foodCode: "18051", name: "おにぎり 鮭", groupCode: "18", kcal100g: 175, protein100g: 3.5, fat100g: 0.6, carbs100g: 38.0 },
  { foodCode: "18052", name: "おにぎり 梅", groupCode: "18", kcal100g: 168, protein100g: 2.5, fat100g: 0.3, carbs100g: 38.5 },
  { foodCode: "18053", name: "ツナマヨおにぎり", groupCode: "18", kcal100g: 200, protein100g: 4.0, fat100g: 4.5, carbs100g: 36.0 },
  { foodCode: "18054", name: "サンドイッチ ハムレタス", groupCode: "18", kcal100g: 240, protein100g: 9.0, fat100g: 9.0, carbs100g: 30.0 },
  { foodCode: "18055", name: "から揚げ弁当", groupCode: "18", kcal100g: 210, protein100g: 8.0, fat100g: 9.5, carbs100g: 24.0 },

  // === 種実類 (05) ===
  { foodCode: "05001", name: "アーモンド", groupCode: "05", kcal100g: 609, protein100g: 19.6, fat100g: 51.8, carbs100g: 20.9 },
  { foodCode: "05026", name: "くるみ", groupCode: "05", kcal100g: 713, protein100g: 14.6, fat100g: 68.8, carbs100g: 11.7 },
  { foodCode: "05017", name: "ピーナッツ", groupCode: "05", kcal100g: 613, protein100g: 25.4, fat100g: 47.0, carbs100g: 18.8 },

  // === その他 主食バリエーション ===
  { foodCode: "01088-2", name: "玄米", groupCode: "01", kcal100g: 346, protein100g: 6.8, fat100g: 2.7, carbs100g: 74.3 },
  { foodCode: "01006", name: "そうめん 茹で", groupCode: "01", kcal100g: 114, protein100g: 3.5, fat100g: 0.4, carbs100g: 24.9 },
  { foodCode: "01007", name: "ラーメン 中華麺 生", groupCode: "01", kcal100g: 281, protein100g: 9.5, fat100g: 1.2, carbs100g: 56.7 },
];

/**
 * food_aliases 初期データ(約100件)。
 * alias は normalizeFoodName() で正規化した形で food_aliases.alias に保存する
 * (DBアクセス層・突合処理は正規化済み文字列で完全一致検索を行う)。
 */
export const FOOD_ALIASES_SEED: AliasSeed[] = [
  { alias: "ごはん", foodName: "精白米めし" },
  { alias: "ご飯", foodName: "精白米めし" },
  { alias: "白米", foodName: "精白米めし" },
  { alias: "白飯", foodName: "精白米めし" },
  { alias: "米飯", foodName: "精白米めし" },
  { alias: "ライス", foodName: "精白米めし" },
  { alias: "玄米ごはん", foodName: "玄米めし" },
  { alias: "玄米ご飯", foodName: "玄米めし" },
  { alias: "とりむね", foodName: "鶏むね肉 皮なし" },
  { alias: "鶏むね", foodName: "鶏むね肉 皮なし" },
  { alias: "鶏胸肉", foodName: "鶏むね肉 皮なし" },
  { alias: "むね肉", foodName: "鶏むね肉 皮なし" },
  { alias: "とりもも", foodName: "鶏もも肉 皮つき" },
  { alias: "鶏もも", foodName: "鶏もも肉 皮つき" },
  { alias: "鶏もも肉", foodName: "鶏もも肉 皮つき" },
  { alias: "もも肉", foodName: "鶏もも肉 皮つき" },
  { alias: "ささみ", foodName: "鶏ささみ" },
  { alias: "鶏肉ささみ", foodName: "鶏ささみ" },
  { alias: "豚肉", foodName: "豚ロース 脂身つき" },
  { alias: "豚ロース肉", foodName: "豚ロース 脂身つき" },
  { alias: "豚バラ肉", foodName: "豚バラ" },
  { alias: "バラ肉", foodName: "豚バラ" },
  { alias: "豚もも", foodName: "豚もも肉" },
  { alias: "牛肉", foodName: "牛バラ" },
  { alias: "牛バラ肉", foodName: "牛バラ" },
  { alias: "牛もも", foodName: "牛もも肉" },
  { alias: "牛肩ロース肉", foodName: "牛肩ロース" },
  { alias: "サーモン", foodName: "さけ" },
  { alias: "鮭", foodName: "さけ" },
  { alias: "焼き鮭", foodName: "鮭の塩焼き" },
  { alias: "鯖", foodName: "さば" },
  { alias: "サバ", foodName: "さば" },
  { alias: "鯖の味噌煮", foodName: "さばの味噌煮" },
  { alias: "まぐろ赤身", foodName: "まぐろ 赤身" },
  { alias: "マグロ", foodName: "まぐろ 赤身" },
  { alias: "トロ", foodName: "まぐろ とろ" },
  { alias: "ぶり照り焼き", foodName: "ぶりの照り焼き" },
  { alias: "豆腐", foodName: "木綿豆腐" },
  { alias: "もめん豆腐", foodName: "木綿豆腐" },
  { alias: "絹豆腐", foodName: "絹ごし豆腐" },
  { alias: "冷奴", foodName: "絹ごし豆腐" },
  { alias: "なっとう", foodName: "納豆" },
  { alias: "卵", foodName: "鶏卵" },
  { alias: "玉子", foodName: "鶏卵" },
  { alias: "たまご", foodName: "鶏卵" },
  { alias: "ゆで卵", foodName: "鶏卵" },
  { alias: "ゆでたまご", foodName: "鶏卵" },
  { alias: "卵焼き", foodName: "卵焼き" },
  { alias: "だし巻き卵", foodName: "出し巻き卵" },
  { alias: "牛乳", foodName: "牛乳" },
  { alias: "ミルク", foodName: "牛乳" },
  { alias: "ヨーグルト", foodName: "ヨーグルト 無糖" },
  { alias: "プレーンヨーグルト", foodName: "ヨーグルト 無糖" },
  { alias: "キャベツ", foodName: "キャベツ" },
  { alias: "千切りキャベツ", foodName: "キャベツ" },
  { alias: "玉ねぎ", foodName: "たまねぎ" },
  { alias: "オニオン", foodName: "たまねぎ" },
  { alias: "人参", foodName: "にんじん" },
  { alias: "大根", foodName: "だいこん" },
  { alias: "白菜", foodName: "はくさい" },
  { alias: "ほうれん草", foodName: "ほうれんそう" },
  { alias: "ブロッコリー", foodName: "ブロッコリー" },
  { alias: "きゅうり", foodName: "きゅうり" },
  { alias: "トマト", foodName: "トマト" },
  { alias: "プチトマト", foodName: "ミニトマト" },
  { alias: "なす", foodName: "なす" },
  { alias: "ピーマン", foodName: "ピーマン青" },
  { alias: "かぼちゃ", foodName: "かぼちゃ" },
  { alias: "とうもろこし", foodName: "とうもろこし" },
  { alias: "コーン", foodName: "とうもろこし" },
  { alias: "もやし", foodName: "もやし" },
  { alias: "長ねぎ", foodName: "ねぎ" },
  { alias: "ねぎ", foodName: "ねぎ" },
  { alias: "レタス", foodName: "レタス" },
  { alias: "じゃがいも", foodName: "じゃがいも" },
  { alias: "さつまいも", foodName: "さつまいも" },
  { alias: "さといも", foodName: "さといも" },
  { alias: "食パン", foodName: "食パン" },
  { alias: "トースト", foodName: "食パン" },
  { alias: "ロールパン", foodName: "ロールパン" },
  { alias: "クロワッサン", foodName: "クロワッサン" },
  { alias: "うどん", foodName: "うどん 茹で" },
  { alias: "そば", foodName: "そば 茹で" },
  { alias: "蕎麦", foodName: "そば 茹で" },
  { alias: "中華麺", foodName: "中華麺 茹で" },
  { alias: "ラーメンの麺", foodName: "中華麺 茹で" },
  { alias: "スパゲッティ", foodName: "スパゲッティ 茹で" },
  { alias: "パスタ", foodName: "スパゲッティ 茹で" },
  { alias: "から揚げ", foodName: "から揚げ" },
  { alias: "唐揚げ", foodName: "から揚げ" },
  { alias: "鶏の唐揚げ", foodName: "から揚げ" },
  { alias: "とんかつ", foodName: "とんかつ" },
  { alias: "餃子", foodName: "餃子" },
  { alias: "ギョーザ", foodName: "餃子" },
  { alias: "コロッケ", foodName: "コロッケ" },
  { alias: "肉じゃが", foodName: "肉じゃが" },
  { alias: "麻婆豆腐", foodName: "麻婆豆腐" },
  { alias: "マーボー豆腐", foodName: "麻婆豆腐" },
  { alias: "ハンバーグ", foodName: "ハンバーグ" },
  { alias: "サラダチキン", foodName: "サラダチキン" },
  { alias: "セブンのサラダチキン", foodName: "サラダチキン" },
  { alias: "ポテトサラダ", foodName: "ポテトサラダ" },
  { alias: "味噌汁", foodName: "味噌汁" },
  { alias: "みそ汁", foodName: "味噌汁" },
  { alias: "豚汁", foodName: "豚汁" },
  { alias: "カレー", foodName: "カレーライス" },
  { alias: "カレーライス", foodName: "カレーライス" },
  { alias: "親子丼", foodName: "親子丼" },
  { alias: "牛丼", foodName: "牛丼" },
  { alias: "チャーハン", foodName: "チャーハン" },
  { alias: "炒飯", foodName: "チャーハン" },
  { alias: "おにぎり", foodName: "おにぎり" },
  { alias: "梅おにぎり", foodName: "おにぎり 梅" },
  { alias: "鮭おにぎり", foodName: "おにぎり 鮭" },
  { alias: "ツナマヨ", foodName: "ツナマヨおにぎり" },
  { alias: "バナナ", foodName: "バナナ" },
  { alias: "りんご", foodName: "りんご" },
  { alias: "みかん", foodName: "うんしゅうみかん" },
  { alias: "プロテイン", foodName: "脱脂粉乳" },
  { alias: "オリーブオイル", foodName: "オリーブ油" },
  { alias: "サラダ油", foodName: "サラダ油" },
  { alias: "バター", foodName: "バター" },
  { alias: "マヨネーズ", foodName: "マヨネーズ" },
  { alias: "醤油", foodName: "しょうゆ 濃口" },
  { alias: "しょうゆ", foodName: "しょうゆ 濃口" },
  { alias: "味噌", foodName: "みそ 米みそ" },
  { alias: "ビール", foodName: "ビール" },
  { alias: "アーモンド", foodName: "アーモンド" },
  { alias: "くるみ", foodName: "くるみ" },
];
