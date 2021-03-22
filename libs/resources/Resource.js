const path = require('path');

class Resource {
    constructor(path, resourceType, resourceResolver) {
        this._path = path;
        this._resourceResolver = resourceResolver;
        this._resourceType = resourceType;
    }

    get path() {
        return this._path;
    }

    get name() {
        return path.basename(this._path);
    }

    get children() {
        return this._resourceResolver.getChildren(this);
    }

    get valueMap() {
        return this._resourceResolver.getValueMap(this);
    }

    get parent() {
        return this._resourceResolver.getParent(this);
    }

    get resourceType() {
        return this._resourceType;
    }

    listChildren() {
        return this._resourceResolver.getChildren(this);
    }

    getChild(name) {
        return this._resourceResolver.getChild(this, name);
    }
}

module.exports = Resource;
