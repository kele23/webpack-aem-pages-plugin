const fs = require('fs');
const vm = require('vm');
const path = require('path');
module.exports = function (mpath) {
    return function () {
        this.mpath = mpath;
        this.use = async function (globals) {
            if (!fs.existsSync(this.mpath)) return {};
            const _require = require;
            const source = fs.readFileSync(this.mpath, { encoding: 'utf-8' });
            const vmContext = vm.createContext({
                use: (fn) => {
                    return fn.call(globals);
                },
                console,
                exports,
                require: (filepath) => {
                    const p = path.resolve(path.dirname(this.mpath), filepath);
                    return _require(p);
                },
                module,
                __filename,
                __dirname,
            });
            const vmScript = new vm.Script(source);
            return vmScript.runInContext(vmContext);
        };
    };
};
