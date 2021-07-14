const glob = require('glob');
const fs = require('fs');
const path = require('path');
const slash = require('slash');

class RepositoryContentReader {
    constructor(sourceDir, projectName, { compilation, logger }) {
        this.sourceDir = sourceDir;
        this.rootPage = 'content/' + projectName;
        this.compilation = compilation;
        this.logger = logger;
        this.contents = {};
    }

    async readContents() {
        const pagesFile = glob.sync('**/*.json', { cwd: path.resolve(this.sourceDir, this.rootPage) });

        for (const pageFile of pagesFile) {
            const pageFileAbs = path.resolve(this.sourceDir, this.rootPage, pageFile);
            await this._readContent(pageFileAbs);
            //add file to dependencies
            this.compilation.fileDependencies.add(pageFileAbs);
        }

        return this.contents;
    }

    async _readContent(filePath) {
        if (!filePath) {
            throw new Error('The filePath is empty');
        }

        const source = fs.readFileSync(filePath, { encoding: 'utf-8' });
        const content = JSON.parse(source);
        const contentName = path.basename(filePath, '.json');
        const contentPath = path.join(
            '/',
            path.relative(this.sourceDir, path.dirname(filePath)),
            contentName != 'index' ? `/${contentName}` : ''
        );

        this._explode(content, slash(contentPath));
    }

    _explode(content, contentPath) {
        this.contents[contentPath] = content;
        for (const child in content) {
            if (typeof content[child] == 'object') {
                this._explode(content[child], contentPath + '/' + child);
            }
        }
    }
}

module.exports = RepositoryContentReader;
