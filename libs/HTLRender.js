const { Compiler, Runtime } = require('@adobe/htlengine');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

class HTLRender {
    /**
     *
     * @param {string} repoDir The respository directory path
     * @param {string} projectName The project name
     * @param {BindingsProvider} bindings The BindingsPro
     * @param {Object} options Compilation options
     */
    constructor(repoDir, projectName, bindings, { compilation, logger }) {
        this.repoDir = repoDir;
        this.sourceDir = path.join(repoDir, 'apps');
        this.projectName = projectName;
        this.bindings = bindings;
        this.logger = logger;
        this.compilation = compilation;
        this.componentsCompiled = {};
    }

    /**
     * The compilation options
     * @param {Object} compilationOptions
     */
    async loadComponents() {
        const componentsFile = glob.sync('**/*.html', { cwd: path.resolve(this.sourceDir, this.projectName) });

        for (const componentFile of componentsFile) {
            const componentFileAbs = path.resolve(this.sourceDir, this.projectName, componentFile);
            const resourceType = path.relative(this.sourceDir, path.dirname(componentFileAbs));
            const source = fs.readFileSync(componentFileAbs, { encoding: 'utf-8' });
            const compiler = this._getCompiler(resourceType);
            this.componentsCompiled[componentFileAbs] = await compiler.compileToFunction(source);
            //add file to dependencies
            this.compilation.fileDependencies.add(componentFileAbs);
        }
    }

    /**
     * Render a page resource
     * @param {Resource} pageResource
     * @param {Object} compilationOptions
     * @returns {string} HTML
     */
    async rendPage(pageResource) {
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

        this.logger.info(`Rendered page ${pageResource.path}`);
        return html;
    }

    /**
     * Render an htl file
     * @param {string} componentAbsPath
     * @param {Object} global
     * @returns {string} HTML
     */
    async _rendFile(componentAbsPath, global) {
        const func = this.componentsCompiled[componentAbsPath];
        const runtime = new Runtime()
            .withResourceLoader(this._makeResourceLoader())
            .withIncludeHandler(this._makeIncludeHandler())
            .setGlobal(global);
        return await func(runtime);
    }

    ////////////////////////////////////////// COMPILATION

    /**
     * Get the compiler object base on resource type
     * @param {string} resourceType
     * @returns {Compiler} compiler
     */
    _getCompiler(resourceType) {
        const runtimeVars = ['resource', 'properties', 'wcmmode', 'pageProperties', 'resourceResolver'].concat(
            this.bindings.names
        );

        return new Compiler()
            .withScriptResolver(this._makeScriptResolver(resourceType))
            .withModuleImportGenerator(this._makeModuleImportGenerator(resourceType))
            .withRuntimeVar(runtimeVars);
    }

    /**
     * Make a script resolver
     * This method is used to resolve data-sly-use call to templates
     * @param {string} resourceType
     * @returns {(baseDir, uri) => string} The resolve script
     */
    _makeScriptResolver(resourceType) {
        return async (baseDir, uri) => {
            return path.resolve(this.sourceDir, resourceType, baseDir, uri);
        };
    }

    /**
     * Make a module import generator
     * This method is used to resolve data-sly-use call to models
     * @param {string} resourceType
     * @returns {(baseDir, varName, moduleId) => string} The module import function
     */
    // eslint-disable-next-line no-unused-vars
    _makeModuleImportGenerator(resourceType) {
        return (baseDir, varName, moduleId) => {
            if (!fs.existsSync(moduleId)) {
                const mPath = path.resolve(__dirname, 'models', moduleId);
                if (fs.existsSync(mPath)) moduleId = mPath;
            }
            if (fs.existsSync(moduleId)) {
                this.compilation.fileDependencies.add(moduleId);
                return `const ${varName} = require('${path.resolve(__dirname, 'JsUseProvider')}')('${moduleId}')`;
            }
            this.logger.warn(`Cannot find ${moduleId} module`);
            return null;
        };
    }
    //////////////////// RUNTIME

    /**
     * Make a resource loader
     * A resource loader is a function that use runtime and resource name to product HTML
     * Resource Loader resolves data-sly-resource
     * @returns {async (runtime, name) => string} Resource Loader
     */
    _makeResourceLoader() {
        return async (runtime, name) => {
            const parentGlobals = runtime.globals;
            const parent = parentGlobals.resource;

            const resource = parent.getChild(name);
            let globals = {
                resourceResolver: parentGlobals.resourceResolver,
                pageProperties: parentGlobals.pageProperties,
                wcmmode: parentGlobals.wcmmode,
                resource: resource,
                properties: resource.valueMap,
            };

            globals = {
                ...globals,
                ...(await this.bindings.provide(this.sourceDir, resource, globals)),
            };

            const componentPath = path.resolve(this.sourceDir, resource.resourceType);
            const componentName = path.basename(componentPath);
            return await this._rendFile(path.join(componentPath, `${componentName}.html`), globals);
        };
    }

    /**
     * Make a include handler
     * A include handler is a function that use runtime and a file path to produce HTML
     * Include Handler resolves data-sly-include
     * @returns {async (runtime, name) => string} Include handler
     */
    _makeIncludeHandler() {
        return async (runtime, file) => {
            const absFile = path.resolve(file);
            const globals = runtime.globals;
            return await this._rendFile(absFile, globals);
        };
    }
}

module.exports = HTLRender;
