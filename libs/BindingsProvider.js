const JsUseProvider = require('./JsUseProvider');
const path = require('path');
const fs = require('fs');

class BindingsProvider {
    /**
     * Construct a bindings provider
     * @param {Object} bindings Custom bindings provided in plugin configuration
     * @param {Object} compilationOptions Compilation options
     */
    constructor(bindings, options) {
        this.bindings = bindings;
        this.options = options;
        this.compilation = options.compilation;
    }

    /**
     * Get bindings names
     */
    get names() {
        let result = ['model'];
        if (this.bindings) result = result.concat(Object.keys(this.bindings));
        return result;
    }

    /**
     *
     * Provide the bindings for the current resource
     * @param {string} sourceDir
     * @param {Resource} resource
     * @param {Object} currentGlobals
     * @returns {Object} The bindings
     */
    async provide(sourceDir, resource, currentGlobals) {
        const result = {};
        const absPath = path.resolve(sourceDir, resource.resourceType, '@model.js');
        if (fs.existsSync(absPath)) {
            this.compilation.fileDependencies.add(absPath);
            const Model = JsUseProvider(absPath);
            result['model'] = await new Model().use(currentGlobals);
        }
        if (this.bindings) {
            for (const key in this.bindings) {
                if (typeof this.bindings[key] == 'function')
                    result[key] = await this.bindings[key].call(currentGlobals);
                else result[key] = this.bindings[key];
            }
        }
        return result;
    }
}

module.exports = BindingsProvider;
