'use strict';

var fs2 = require('fs');
var path = require('path');
var esbuild = require('esbuild');
var pluginutils = require('@rollup/pluginutils');
var JoyCon = require('joycon');
var strip = require('strip-json-comments');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var fs2__default = /*#__PURE__*/_interopDefaultLegacy(fs2);
var JoyCon__default = /*#__PURE__*/_interopDefaultLegacy(JoyCon);
var strip__default = /*#__PURE__*/_interopDefaultLegacy(strip);

const joycon2 = new JoyCon__default['default']();
joycon2.addLoader({
  test: /\.json$/,
  load: async (file) => {
    const content = await fs2__default['default'].promises.readFile(file, "utf8");
    return JSON.parse(strip__default['default'](content));
  }
});
const getOptions = async (cwd, tsconfig) => {
  const {data, path} = await joycon2.load([tsconfig || "tsconfig.json"], cwd);
  if (path && data) {
    const {jsxFactory, jsxFragmentFactory, target} = data.compilerOptions || {};
    return {
      jsxFactory,
      jsxFragment: jsxFragmentFactory,
      target: target && target.toLowerCase()
    };
  }
  return {};
};

const defaultLoaders = {
  ".js": "js",
  ".jsx": "jsx",
  ".ts": "ts",
  ".tsx": "tsx"
};
var index = (options2 = {}) => {
  let target;
  const loaders = {
    ...defaultLoaders
  };
  if (options2.loaders) {
    for (const key of Object.keys(options2.loaders)) {
      const value = options2.loaders[key];
      if (typeof value === "string") {
        loaders[key] = value;
      } else if (value === false) {
        delete loaders[key];
      }
    }
  }
  const extensions = Object.keys(loaders);
  const INCLUDE_REGEXP = new RegExp(`\\.(${extensions.map((ext) => ext.slice(1)).join("|")})$`);
  const EXCLUDE_REGEXP = /node_modules/;
  const filter = pluginutils.createFilter(options2.include || INCLUDE_REGEXP, options2.exclude || EXCLUDE_REGEXP);
  let service;
  const stopService = () => {
    if (service) {
      service.stop();
      service = void 0;
    }
  };
  const resolveFile = (resolved, index = false) => {
    for (const ext of extensions) {
      const file = index ? path.join(resolved, `index${ext}`) : `${resolved}${ext}`;
      if (fs2.existsSync(file))
        return file;
    }
    return null;
  };
  return {
    name: "esbuild",
    async buildStart() {
      if (!service) {
        service = await esbuild.startService();
      }
    },
    resolveId(importee, importer) {
      if (importer && importee[0] === ".") {
        const resolved = path.resolve(importer ? path.dirname(importer) : process.cwd(), importee);
        let file = resolveFile(resolved);
        if (file)
          return file;
        if (!file && fs2.existsSync(resolved) && fs2.statSync(resolved).isDirectory()) {
          file = resolveFile(resolved, true);
          if (file)
            return file;
        }
      }
    },
    async transform(code, id) {
      if (!filter(id)) {
        return null;
      }
      const ext = path.extname(id);
      const loader = loaders[ext];
      if (!loader || !service) {
        return null;
      }
      const defaultOptions = options2.tsconfig === false ? {} : await getOptions(path.dirname(id), options2.tsconfig);
      target = options2.target || defaultOptions.target || "es2017";
      const result = await service.transform(code, {
        loader,
        target,
        jsxFactory: options2.jsxFactory || defaultOptions.jsxFactory,
        jsxFragment: options2.jsxFragment || defaultOptions.jsxFragment,
        define: options2.define,
        sourcemap: options2.sourceMap !== false,
        sourcefile: id
      });
      printWarnings(id, result, this);
      return result.code && {
        code: result.code,
        map: result.map || null
      };
    },
    buildEnd(error) {
      if (error && !this.meta.watchMode) {
        stopService();
      }
    },
    async renderChunk(code) {
      if (options2.minify && service) {
        const result = await service.transform(code, {
          loader: "js",
          minify: true,
          target
        });
        if (result.code) {
          return {
            code: result.code,
            map: result.map || null
          };
        }
      }
      return null;
    },
    generateBundle() {
      if (!this.meta.watchMode) {
        stopService();
      }
    }
  };
};
function printWarnings(id, result, plugin) {
  if (result.warnings) {
    for (const warning of result.warnings) {
      let message = `[esbuild]`;
      if (warning.location) {
        message += ` (${path.relative(process.cwd(), id)}:${warning.location.line}:${warning.location.column})`;
      }
      message += ` ${warning.text}`;
      plugin.warn(message);
    }
  }
}

module.exports = index;
