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

    getPath() {
        return this._path;
    }

    get name() {
        return path.basename(this._path);
    }

    getName() {
        return path.basename(this._path);
    }

    get children() {
        return this._resourceResolver.getChildren(this);
    }

    getChildren() {
        return this._resourceResolver.getChildren(this);
    }

    get valueMap() {
        return this._resourceResolver.getValueMap(this);
    }

    getValueMap() {
        return this._resourceResolver.getValueMap(this);
    }

    get parent() {
        return this._resourceResolver.getParent(this);
    }

    getParent() {
        return this._resourceResolver.getParent(this);
    }

    get resourceType() {
        return this._resourceType;
    }

    getResourceType() {
        return this._resourceType;
    }

    get properties() {
        return this.valueMap;
    }

    getProperties() {
        return this.valueMap;
    }

    get resourceResolver() {
        return this._resourceResolver;
    }

    getResourceResolver() {
        return this._resourceResolver;
    }

    listChildren() {
        return this._resourceResolver.getChildren(this);
    }

    getChild(name) {
        return this._resourceResolver.getChild(this, name);
    }
}

module.exports = Resource;
