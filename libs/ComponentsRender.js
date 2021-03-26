const { Compiler, Runtime } = require('@adobe/htlengine');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const glob = require('glob');

class HTLRender {
    constructor(repoDir, projectName, bindings) {
        this.repoDir = repoDir;
        this.sourceDir = path.join(repoDir, 'apps');
        this.projectName = projectName;
        this.bindings = bindings;
        this.componentsCompiled = {};
    }

    async loadComponents({ compilation }) {
        const componentsFile = glob.sync('**/*.html', { cwd: path.resolve(this.sourceDir, this.projectName) });

        for (const componentFile of componentsFile) {
            const componentFileAbs = path.resolve(this.sourceDir, this.projectName, componentFile);
            const resourceType = path.relative(this.sourceDir, path.dirname(componentFileAbs));
            const source = fs.readFileSync(componentFileAbs, { encoding: 'utf-8' });
            const compiler = this._getCompiler(resourceType);
            this.componentsCompiled[componentFileAbs] = await compiler.compileToFunction(source);
            //add file to dependencies
            compilation.fileDependencies.add(componentFileAbs);
        }

    }

    async rendPage(pageResource, { logger }) {

        const global = {
            pageProperties: pageResource.getChild('jcr:content').valueMap,
            wcmmode: { disabled: true },
            resource: pageResource,
            properties: pageResource.valuMap,
        };

        const compiler = this._getCompiler(pageResource.resourceType);
        const runtime = new Runtime()
            .withResourceLoader(this._makeResourceLoader())
            .withIncludeHandler(this._makeIncludeHandler())
            .setGlobal(global);
        const func = await compiler.compileToFunction('<sly data-sly-resource="jcr:content"></sly>');
        const html = await func(runtime);

        logger.info(`Rendered page ${pageResource.path}`);
        return html;
    }

    /**
     * Get the compiler object base on resource type
     * @param {string} resourceType
     * @returns {Compiler} compiler
     */
    _getCompiler(resourceType) {
        const runtimeVars = ['resource', 'properties', 'wcmmode', 'model', 'pageProperties', 'resourceResolver'];
        for (const binding in this.bindings) {
            if (typeof this.bindings[binding] == 'function') {
                runtimeVars.push(binding);
            }
        }
        return new Compiler()
            .withScriptResolver(this._makeScriptResolver(resourceType))
            .withModuleImportGenerator(this._makeModuleImportGenerator(resourceType))
            .withRuntimeVar(runtimeVars);
    }

    /**
     * Load a resource, launching same name html of the resource type
     * @returns
     */
    _makeResourceLoader() {
        return async (runtime, name) => {
            const parentGlobals = runtime.globals;
            const parent = parentGlobals.resource;

            const resource = parent.getChild(name);
            const globals = {
                pageProperties: parentGlobals.pageProperties,
                wcmmode: parentGlobals.wcmmode,
                resource: resource,
                properties: resource.valueMap,
                model: null,
            };
            globals.model = await this._getResourceModel(resource, globals);

            for (const binding in this.bindings) {
                if (typeof this.bindings[binding] == 'function') {
                    globals[binding] = this.bindings[binding](globals);
                }
            }

            const componentPath = path.resolve(this.sourceDir, resource.resourceType);
            const componentName = path.basename(componentPath);
            return await this._rendFile(path.join(componentPath, `${componentName}.html`), globals);
        };
    }

    async _rendFile(componentAbsPath, global) {
        const func = this.componentsCompiled[componentAbsPath];
        const runtime = new Runtime()
            .withResourceLoader(this._makeResourceLoader())
            .withIncludeHandler(this._makeIncludeHandler())
            .setGlobal(global);
        return await func(runtime);
    }

    _makeIncludeHandler() {
        return async (runtime, file, options) => {
            const absFile = path.resolve(file);
            const globals = runtime.globals;
            return await this._rendFile(absFile, globals);
        };
    }

    /**
     * Make a script resolver, if not found it resolves to a dummy ( empty ) script
     * @param {string} resourceType
     * @returns {(baseDir, uri) => string} The resolve script
     */
    _makeScriptResolver(resourceType) {
        return async (baseDir, uri) => {
            const absPath = path.resolve(this.sourceDir, resourceType, baseDir, uri);
            if (fs.existsSync(absPath)) return absPath;
            return path.resolve(__dirname, 'data', 'dummy-htl.html');
        };
    }

    _makeModuleImportGenerator(resourceType) {
        return HTLRender.defaultModuleGenerator;
    }

    /**
     *
     * @param {*} resource
     * @param {*} globals
     * @returns
     */
    async _getResourceModel(resource, globals) {
        const componentPath = path.resolve(this.sourceDir, resource.resourceType);
        const modelPath = path.join(componentPath, `@model.js`);
        if (!fs.existsSync(modelPath)) return null;

        const source = fs.readFileSync(modelPath, { encoding: 'utf-8' });
        const vmContext = vm.createContext({
            use: (fn) => {
                return fn.call(globals);
            },
            console: console,
        });

        const vmScript = new vm.Script(source);
        return vmScript.runInContext(vmContext);
    }

    /**
     * Generates the module import statement.
     *
     * @param {string} baseDir the base directory (usually cwd)
     * @param {string} varName the variable name of the module to be defined.
     * @param {string} moduleId the id of the module
     * @returns {string} the import string.
     */
    static defaultModuleGenerator(baseDir, varName, moduleId) {
        // make path relative to output directory
        if (path.isAbsolute(moduleId)) {
            // eslint-disable-next-line no-param-reassign
            moduleId = `.${path.sep}${path.relative(baseDir, moduleId)}`;
            if (path.sep === '\\') {
                // nodejs on windows doesn't like relative paths with windows path separators
                // eslint-disable-next-line no-param-reassign
                moduleId = moduleId.replace(/\\/, '/');
            }
        } else {
            moduleId = path.resolve(__dirname, 'data', 'dummy-model.js');
        }
        const source = fs.readFileSync(moduleId, { encoding: 'utf-8' });
        return `const ${varName} = () => {class XX {
            use: () => {
                const source = ``${source}``;
                const vmContext = vm.createContext({
                    use: (fn) => {
                        return fn.call(globals);
                    },
                    console: console,
                });

                const vmScript = new vm.Script(source);
                return vmScript.runInContext(vmContext);
            },
        }}`;
    }
}

module.exports = HTLRender;
