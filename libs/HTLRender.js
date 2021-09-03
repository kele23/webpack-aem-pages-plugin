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
            //add file to dependencies
            this.compilation.fileDependencies.add(componentFileAbs);

            //compile file
            try {
                this.componentsCompiled[componentFileAbs] = await compiler.compileToFunction(source);
            } catch (error) {
                this.logger.error('Cannot compile HTL file ' + componentFileAbs);
                this.logger.error(error);
            }
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
            resourceResolver: pageResource.resourceResolver,
            properties: pageResource.valueMap,
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
     * Render a page resource
     * @param {Resource} pageResource
     * @param {Object} compilationOptions
     * @returns {string} HTML
     */
    async rendComponent(componentResource, selectors) {
        const componentPath = path.resolve(this.sourceDir, componentResource.resourceType);
        const componentName = path.basename(componentPath);
        const componentHtmlFileAbs =
            selectors == null || selectors.length == 0
                ? path.join(componentPath, `${componentName}.html`)
                : path.join(componentPath, `${selectors}.html`);
        if (!fs.existsSync(componentHtmlFileAbs)) {
            return null;
        }

        let global = {
            wcmmode: { disabled: true },
            resource: componentResource,
            resourceResolver: componentResource.resourceResolver,
            properties: componentResource.valueMap,
        };

        global = {
            ...global,
            ...(await this.bindings.provide(this.sourceDir, componentResource, global)),
        };

        const html = await this._rendFile(componentHtmlFileAbs, global);
        this.logger.info(`Rendered component ${componentResource.path} with selectors ${selectors}`);
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
        try {
            return await func(runtime);
        } catch (error) {
            this.logger.error('Cannot execute HTL file ' + componentAbsPath);
            this.logger.error(error);
        }
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
            let absPath = path.resolve(this.sourceDir, resourceType, baseDir, uri);
            if (fs.existsSync(absPath)) return absPath;
            absPath = path.resolve(this.sourceDir, baseDir, uri);
            if (fs.existsSync(absPath)) return absPath;
            return path.resolve(this.sourceDir, uri);
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
        return async (runtime, oName, options) => {
            const parentGlobals = runtime.globals;
            const parent = parentGlobals.resource;
            const resourceResolver = parentGlobals.resourceResolver;

            const absolute = oName.startsWith('/');
            const name = absolute ? path.basename(oName) : oName;
            const nameSplit = name.split('.');
            const resourceName = nameSplit[0];
            let selectors = null;
            if (nameSplit.length > 1) {
                selectors = nameSplit.slice(1).join('.');
            }

            let resource;
            if (absolute) {
                const dirname = path.dirname(oName);
                resource = resourceResolver.getResource(dirname + '/' + resourceName);
            } else {
                resource = parent.getChild(resourceName);
            }

            if (!resource && options.resourceType) {
                resource = resourceResolver.makeSynteticResource({}, parent.path + '/' + name, options.resourceType);
            }

            let globals = {
                resourceResolver: resourceResolver,
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
            const componentHtmlFileAbs =
                selectors == null || selectors.length == 0
                    ? path.join(componentPath, `${componentName}.html`)
                    : path.join(componentPath, `${selectors}.html`);
            return await this._rendFile(componentHtmlFileAbs, globals);
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
