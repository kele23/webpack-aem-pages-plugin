const fs = require('fs');
const vm = require('vm');

module.exports = function (path) {
    return function () {
        this.path = path;
        this.use = async function (globals) {
            if (!fs.existsSync(this.path)) return {};

            const source = fs.readFileSync(this.path, { encoding: 'utf-8' });
            const vmContext = vm.createContext({
                use: (fn) => {
                    return fn.call(globals);
                },
                console: console,
            });

            const vmScript = new vm.Script(source);
            return vmScript.runInContext(vmContext);
        };
    };
};
