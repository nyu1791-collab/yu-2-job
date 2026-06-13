// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require("expo/metro-config");

/**
 * Metroのモジュール解決設定。
 *
 * `packages/shared` などのワークスペースパッケージは TypeScript の
 * NodeNext形式(`.js`拡張子で `.ts` ファイルを指す相対import、例:
 * `export * from "./analysis-schema.js"`)を使っている。
 * tscやVitestはこれを解決できるが、Metroのデフォルトリゾルバはファイルが
 * 実際には `.js` として存在しないため解決に失敗する
 * (`Unable to resolve module ./analysis-schema.js from .../packages/shared/src/index.ts`)。
 *
 * そのため、importパスが `.js` で終わり、かつそのままでは存在しない場合のみ
 * `.ts` / `.tsx` / `.jsx` で再解決を試みるフォールバックを追加する。
 * デフォルトの解決が成功する通常のnode_modulesパッケージ等には影響しない
 * (デフォルト解決が例外をスローした場合のみフォールバックが発火する)。
 */
const config = getDefaultConfig(__dirname);

const { resolver } = config;
const defaultResolveRequest = resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    // `./foo.js` -> `./foo.ts`/`.tsx`/`.jsx` へのフォールバック
    // (TypeScript NodeNext形式の相対import向け)。
    if (moduleName.endsWith(".js") && (moduleName.startsWith("./") || moduleName.startsWith("../"))) {
      const basePath = moduleName.slice(0, -3);
      for (const ext of ["ts", "tsx", "jsx"]) {
        try {
          return context.resolveRequest(context, `${basePath}.${ext}`, platform);
        } catch {
          // 次の拡張子を試す
        }
      }
    }
    throw error;
  }
};

// モノレポのワークスペースパッケージ(packages/shared等)を監視・解決できるようにする。
// pnpmのワークスペースではnode_modulesがシンボリックリンクで構成されるため、
// Metroのデフォルト(unstable_enableSymlinks)に依存するが、念のため明示しておく。
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
