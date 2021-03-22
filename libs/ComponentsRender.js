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

        Promise.all(
            componentsFile.map(async (componentFile) => {
                const componentFileAbs = path.resolve(this.sourceDir, this.projectName, componentFile);
                const resourceType = path.relative(this.sourceDir, path.dirname(componentFileAbs));
                const source = fs.readFileSync(componentFileAbs, { encoding: 'utf-8' });
                const compiler = this._getCompiler(resourceType);
                this.componentsCompiled[componentFileAbs] = await compiler.compileToFunction(source);
                //add file to dependencies
                compilation.fileDependencies.add(componentFileAbs);
            })
        );
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

    _getCompiler(resourceType) {
        const runtimeVars = ['resource', 'properties', 'wcmmode', 'model', 'pageProperties', 'resourceResolver'];
        for (const binding in this.bindings) {
            if (typeof this.bindings[binding] == 'function') {
                runtimeVars.push(binding);
            }
        }
        return new Compiler().withScriptResolver(this._makeScriptResolver(resourceType)).withRuntimeVar(runtimeVars);
    }

    async _rendFile(componentAbsPath, global) {
        const func = this.componentsCompiled[componentAbsPath];
        const runtime = new Runtime()
            .withResourceLoader(this._makeResourceLoader())
            .withIncludeHandler(this._makeIncludeHandler())
            .setGlobal(global);
        return await func(runtime);
    }

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
                    this.bindings[binding](globals);
                }
            }

            const componentPath = path.resolve(this.sourceDir, resource.resourceType);
            const componentName = path.basename(componentPath);
            return await this._rendFile(path.join(componentPath, `${componentName}.html`), globals);
        };
    }

    _makeIncludeHandler() {
        return async (runtime, file) => {
            const globals = runtime.globals;
            const absFile = path.resolve(this.sourceDir, file);
            return await this._rendFile(absFile, globals);
        };
    }

    _makeScriptResolver(componentPath) {
        return async (baseDir, uri) => {
            return path.relative(this.sourceDir, path.resolve(this.sourceDir, componentPath, baseDir, uri));
        };
    }

    async _getResourceModel(resource, globals) {
        const componentPath = path.resolve(this.sourceDir, resource.resourceType);
        const modelPath = path.join(componentPath, `model.js`);
        if (!fs.existsSync(modelPath)) return null;
        return await this._readModelJs(modelPath, globals);
    }

    async _readModelJs(filePath, globals) {
        if (!filePath) {
            throw new Error('The filePath is empty');
        }

        const source = fs.readFileSync(filePath, { encoding: 'utf-8' });
        const vmContext = vm.createContext({
            use: (fn) => {
                return fn.call(globals);
            },
            console: console,
        });

        const vmScript = new vm.Script(source);
        return vmScript.runInContext(vmContext);
    }
}

module.exports = HTLRender;
