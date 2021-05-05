const { validate } = require('schema-utils');
const schema = require('./options.json');
//const glob = require('glob');
const path = require('path');
const { sources } = require('webpack');

//plugin classes
const RepositoryContentReader = require('./libs/RepositoryContentReader');
const HTLRender = require('./libs/HTLRender');
const BindingsProvider = require('./libs/BindingsProvider');
const ResourceResolver = require('./libs/ResourceResolver');

class WebpackAEMPagesPlugin {
    /**
     * Construct the WebpackAEMPagesPlugin
     */
    constructor(options = {}) {
        validate(schema, options, {
            name: 'Webpack AEM Pages plugin',
            baseDataPath: 'options',
        });

        this.repoDir = options.repoDir;
        this.projectName = options.projectName;
        this.destDir = options.destDir;
        this.bindings = options.bindings;
        this.defaultModelName = options.defaultModelName || 'model';
        this.renderComponents = options.renderComponents;
        this.renderComponentsSelector = options.renderComponentsSelector || 'loader';
    }

    /**
     * Apply the compiler
     * @param {Compilation} compiler
     */
    apply(compiler) {
        const pluginName = this.constructor.name;

        compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
            const logger = compilation.getLogger('webpack-aem-pages-plugin');

            compilation.hooks.processAssets.tapAsync(
                {
                    name: 'webpack-aem-pages-plugin',
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
                },
                async (saf, callback) => {
                    logger.log('Starting creating pages....');
                    await this.process(compilation);
                    logger.log('Finished creating pages');
                    callback();
                }
            );

            if (compilation.hooks.statsPrinter) {
                compilation.hooks.statsPrinter.tap(pluginName, (stats) => {
                    stats.hooks.print
                        .for('asset.info.created')
                        .tap('webpack-aem-pages-plugin', (created, { green, formatFlag }) =>
                            // eslint-disable-next-line no-undefined
                            created ? green(formatFlag('created')) : undefined
                        );
                });
            }
        });
    }

    /**
     * Process the compilation of static pages plugin
     * @param {Compilation} compilation
     */
    async process(compilation) {
        const cache = compilation.getCache('WebpackAemPagesPlugin');
        const logger = compilation.getLogger('webpack-aem-pages-plugin');

        const options = {
            cache,
            logger,
            compilation,
            data: this.getCompilationBuildData(compilation),
        };

        try {
            //load repository content reader and make HTL Render
            const reader = new RepositoryContentReader(this.repoDir, this.projectName, options);
            const render = new HTLRender(
                this.repoDir,
                this.projectName,
                new BindingsProvider(this.bindings, this.defaultModelName, options),
                options
            );

            const [contents] = await Promise.all([reader.readContents(), render.loadComponents()]);
            const resourceResolver = new ResourceResolver(contents);

            //rend all pages
            const pageResources = resourceResolver.findResources('cq/Page');
            const renderedPages = [];
            for (const pageResource of pageResources) {
                const pageHtml = await render.rendPage(pageResource);
                renderedPages.push({
                    fileName: `${pageResource.path}.html`,
                    absoluteFilename: path.resolve(this.destDir, `${pageResource.path}.html`),
                    html: pageHtml,
                });
            }

            //emit assets pages
            for (const renderedPage of renderedPages) {
                const existingAsset = compilation.getAsset(renderedPage.fileName);
                if (existingAsset) return;

                const info = { created: true };
                compilation.emitAsset(renderedPage.fileName, new sources.RawSource(renderedPage.html, true), {
                    ...info,
                });
            }

            //rend all components resources
            if (this.renderComponents) {
                const regex = new RegExp(this.renderComponents);
                const contentResources = resourceResolver.findResources(regex);
                const renderedResources = [];
                for (const contentRes of contentResources) {
                    const cntHtml = await render.rendComponent(contentRes, this.renderComponentsSelector);
                    if (cntHtml == null) continue;
                    renderedResources.push({
                        fileName: `${contentRes.path}.html`,
                        absoluteFilename: path.resolve(this.destDir, `${contentRes.path}.html`),
                        html: cntHtml,
                    });
                }

                //emit components files
                for (const renderedComponent of renderedResources) {
                    const existingAsset = compilation.getAsset(renderedComponent.fileName);
                    if (existingAsset) return;

                    const info = { created: true };
                    compilation.emitAsset(
                        renderedComponent.fileName,
                        new sources.RawSource(renderedComponent.html, true),
                        {
                            ...info,
                        }
                    );
                }
            }
        } catch (error) {
            logger.error(error);
        }
    }

    getCompilationBuildData(compilation) {
        const build = {
            publicPath: compilation.outputOptions.publicPath,
            scripts: {},
        };
        for (let chunk of compilation.chunks) {
            const files = Array.from(chunk.files);
            build.scripts[chunk.name] = files[0];
        }
        return build;
    }
}

module.exports = WebpackAEMPagesPlugin;
