const { validate } = require('schema-utils');
const schema = require('./options.json');
//const glob = require('glob');
const path = require('path');
const { sources } = require('webpack');
const RepositoryContentReader = require('./libs/RepositoryContentReader');
const HTLRender = require('./libs/ComponentsRender');
const ResourceResolver = require('./libs/resources/ResourceResolver');

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
    }

    /**
     * Apply the compiler
     * @param {Compilation} compiler
     */
    apply(compiler) {
        const pluginName = this.constructor.name;

        compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
            const logger = compilation.getLogger('static-pages-plugin');

            compilation.hooks.processAssets.tapAsync(
                {
                    name: 'static-pages-plugin',
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
                },
                async (saf, callback) => {
                    logger.log('Starting creating static pages....');
                    await this.process(compilation);
                    logger.log('Finished creating pages');
                    callback();
                }
            );

            if (compilation.hooks.statsPrinter) {
                compilation.hooks.statsPrinter.tap(pluginName, (stats) => {
                    stats.hooks.print
                        .for('asset.info.created')
                        .tap('static-pages-plugin', (created, { green, formatFlag }) =>
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
        const cache = compilation.getCache('StaticPagesPlugin');
        const logger = compilation.getLogger('static-pages-plugin');

        const options = {
            cache,
            logger,
            compilation,
            data: this.getCompilationBuildData(compilation),
        };

        try {
            //await this.render.readComponents(options);
            const reader = new RepositoryContentReader(this.repoDir, this.projectName);
            const contents = await reader.readContents(options);
            const resourceResolver = new ResourceResolver(contents);

            const render = new HTLRender(this.repoDir, this.projectName, this.bindings);
            await render.loadComponents(options);

            const pageResources = resourceResolver.findResources('cq/Page');
            const renderedPages = [];
            for (const pageResource of pageResources) {
                const pageHtml = await render.rendPage(pageResource, options);
                renderedPages.push({
                    fileName: `${pageResource.path}.html`,
                    absoluteFilename: path.resolve(this.destDir, `${pageResource.path}.html`),
                    html: pageHtml,
                });
            }

            for (const renderedPage of renderedPages) {
                const existingAsset = compilation.getAsset(renderedPage.fileName);
                if (existingAsset) return;

                const info = { created: true };
                compilation.emitAsset(renderedPage.fileName, new sources.RawSource(renderedPage.html, true), {
                    ...info,
                });
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
