const Resource = require('./Resource');
const path = require('path');

class ResourceResolver {
    constructor(contents) {
        this.contents = contents;
    }

    /**
     * @param {string} path
     * @returns The path of the resource
     */
    getResource(resourcePath) {
        for (const contentPath in this.contents) {
            if (contentPath == resourcePath) {
                return this._makeResource(contentPath, this.contents[contentPath]);
            }
        }
        return null;
    }

    /**
     * @param {Resource} resource
     * @param {string} name
     * @returns The child of the resource with the name
     */
    getChild(resource, name) {
        const resourcePath = resource.path + '/' + name;
        return this._makeResource(resourcePath, this.contents[resourcePath]);
    }

    /**
     * The children of the resource
     * @param {Resource} resource
     */
    getChildren(resource) {
        const result = [];
        const resourcePath = resource.path;
        for (const contentPath in this.contents) {
            if (path.dirname(contentPath) == resourcePath) {
                result.push(this._makeResource(contentPath, this.contents[contentPath]));
            }
        }
        return result;
    }

    /**
     * @param {Resource} resource
     * @returns The parent resource
     */
    getParent(resource) {
        const resourcePath = resource.path;
        const parentPath = path.dirname(resourcePath);
        return this._makeResource(parentPath, this.contents[parentPath]);
    }

    /**
     * The properties of the resource
     * @param {Resource} resource
     */
    getValueMap(resource) {
        return this.contents[resource.path];
    }

    /**
     * Find all resources by resourceType
     */
    findResources(resourceType) {
        const result = [];
        for (const contentPath in this.contents) {
            if (this._getResourceType(this.contents[contentPath]) == resourceType) {
                result.push(this._makeResource(contentPath, this.contents[contentPath]));
            }
        }
        return result;
    }

    /**
     * @param {string} resourcePath
     * @param {object} content
     * @returns Make a new resource
     */
    _makeResource(resourcePath, content) {
        return new Resource(resourcePath, this._getResourceType(content), this);
    }

    /**
     * @param {object} content
     * @returns The resource type
     */
    _getResourceType(content) {
        let resourceType = content['sling:resourceType'];
        if (!resourceType) {
            const primaryType = content['jcr:primaryType'];
            if (primaryType) resourceType = primaryType.replace(/:/g, '/');
            else resourceType = 'nt/unstructured';
        }
        return resourceType;
    }
}

module.exports = ResourceResolver;
