const glob = require('glob');
const fs = require('fs');
const path = require('path');

class RepositoryContentReader {
    constructor(sourceDir, projectName) {
        this.sourceDir = sourceDir;
        this.rootPage = 'content/' + projectName;
        this.contents = {};
    }

    async readContents({ compilation }) {
        const pagesFile = glob.sync('**/*.json', { cwd: path.resolve(this.sourceDir, this.rootPage) });

        await Promise.all(
            pagesFile.map((pageFile) => {
                const pageFileAbs = path.resolve(this.sourceDir, this.rootPage, pageFile);
                //add file to dependencies
                compilation.fileDependencies.add(pageFileAbs);

                return this._readContent(pageFileAbs);
            })
        );

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

        this._explode(content, contentPath);
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
