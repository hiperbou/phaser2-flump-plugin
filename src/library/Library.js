import { Movie } from "../symbols/movie/Movie";
import { MovieData } from "../symbols/movie/MovieData";
import { 
    EMPTY_SYMBOL_TYPE, 
    IMAGE_SYMBOL_TYPE, 
    MOVIE_SYMBOL_TYPE 
} from "../constants/Constants";
import { Symbol } from "../symbols/Symbol";

/**
 * Library - TODO: desciption
 */
export class Library {
    /**
     * @type {number}
     */
    get frameRate() { return this.data.frameRate || 0; }

    constructor(game, key) {
        /**
         * @type {Phaser.Game}
         */
        this.game = game;

        /**
         * @type {string}
         */
        this.key = key;

        /**
         * @type {boolean}
         */
        this.isDestroyed = false;

        /**
         * A map of what symbol belongs to which atlas png.
         * @type {Object.<string, string>}
         */
        this.imageAtlasMap = {};

        /**
         * A list of atlas names for this library.
         * @type {Array.<string>}
         */
        this.atlases = []

        /**
         * Storage for unused symbols.
         * @type {Object.<string, Array.<Symbol> | Object.<string, Array.<Symbol | Movie>>>}
         */
        this.symbolPools = { 
            [EMPTY_SYMBOL_TYPE]: [],
            [MOVIE_SYMBOL_TYPE]: {},
            [IMAGE_SYMBOL_TYPE]: {}
        };

        // Verify the library.json file for this library has been loaded to cache.
        if (!this.game.cache.checkJSONKey(key)) {
            throw new Error(`Cannot find library JSON for ${key} in game cache.`);
        }

        /** @type {Object.<string, any} */
        this.data = this.game.cache.getJSON(key);

        // Verify the movies list exits in the library's data.
        if (this.data.movies === undefined) {
            throw new Error(`Library data for ${this.key} is missing the 'movies' field.`);
        }

        /**
         * @type {Object.<string, MovieData}
         */
        this.movieMap = {};
        this.data.movies.forEach((movie, i) => {
            if (movie.id === undefined) {
                throw new Error(`Movie ${i} in ${this.key} is missing the id field.`);
            }
            this.movieMap[movie.id] = new MovieData(this.key, movie);
        });

        // Generate the frame data for each texture symbol in this library.
        this.generateFrameData();
    }

    /**
     * Destroys and cleans up this library.
     */
    destroy(unloadDependencies = true) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has already been destroyed.`);
        }

        // Clean up MovieData objects.
        for (let key in this.movieMap) {
            this.movieMap[key].destroy();
        }
        this.movieMap = undefined;

        // Clean up the pooled library symbols
        this.symbolPools[EMPTY_SYMBOL_TYPE].forEach(symbol => symbol.destroy());
        for (let key in this.symbolPools[IMAGE_SYMBOL_TYPE]) {
            this.symbolPools[IMAGE_SYMBOL_TYPE][key].forEach(symbol => symbol.destroy());
        }
        for (let key in this.symbolPools[MOVIE_SYMBOL_TYPE]) {
            this.symbolPools[MOVIE_SYMBOL_TYPE][key].forEach(symbol => symbol.destroy());
        }
        this.symbolPools = undefined

        // If specified, unload cached library dependencies.
        if (unloadDependencies) {
            this.game.cache.removeJSON(this.key);
            this.atlases.forEach(atlas => this.game.cache.removeImage(atlas, true));
        }

        // Clean up references.
        this.game = undefined;
        this.data = undefined;
        this.imageAtlasMap = undefined;
    }

    /**
     * Creates either a Movie or Image symbol from this library.
     * @param {string} key Symbol key
     * @return {Movie | Symbol}
     */
    create(key) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and cannot be used to make new symbols.`);
        }

        if (key === undefined) {
            return this.getFreeSymbol(EMPTY_SYMBOL_TYPE);
        }
        else if (this.imageAtlasMap[key] !== undefined) {
            return this.getFreeSymbol(IMAGE_SYMBOL_TYPE, key);
        }
        else if (this.movieMap[key] !== undefined) {
            return this.getFreeSymbol(MOVIE_SYMBOL_TYPE, key);
        }
        throw new Error(`Cannot find symbol ${key} in ${this.key}.`);
    }

    /**
     * Check to see if this library contains a symbol for the provided key.
     * @param {string} key 
     */
    hasSymbol(key) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and has no symbols.`);
        }
        return this.hasImageSymbol(key) || this.hasMovieSymbol(key);
    }

    /**
     * Check to see if this library contains the provided Movie key.
     * @param {string} key 
     */
    hasMovieSymbol(key) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and has no symbols.`);
        }
        return this.movieMap[key] !== undefined;
    }

    /**
     * Check to see if this library contains the provided Image key.
     * @param {string} key 
     */
    hasImageSymbol(key) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and has no symbols.`);
        }
        return this.imageAtlasMap[key] !== undefined;
    }

    /**
     * Returns the MovieData object for the provided Movie key.
     * @param {string} key 
     */
    getMovieData(key) {
        if (!this.hasMovieSymbol(key)) {
            throw new Error(`${this.key} does not contain MovieData for ${key}.`);
        }
        return this.movieMap[key];
    }

    /**
     * Returns a free symbol from a pool, or creates a new library symbol.
     * @param {string} type 
     * @param {string} key 
     */
    getFreeSymbol(type, key) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and has no symbols.`);
        }
        /**
         * @type {Symbol | Movie}
         */
        let symbol;

        const symbolKey = key || EMPTY_SYMBOL_TYPE;

        // Determine which type of symbol is to be returned.
        switch (type) {
            case EMPTY_SYMBOL_TYPE:
                if (this.symbolPools[EMPTY_SYMBOL_TYPE].length > 0) {
                    symbol = this.symbolPools[EMPTY_SYMBOL_TYPE].shift();
                }
                else {
                    symbol = new Symbol(this.game); // Allocation
                }
                break;

            case MOVIE_SYMBOL_TYPE:
            case IMAGE_SYMBOL_TYPE:
                this.symbolPools[type][key] = this.symbolPools[type][key] || [];

                // Check and return from the pools.
                if (this.symbolPools[type][key].length > 0) {
                    symbol = this.symbolPools[type][key].shift();
                }
                // No free symbols, create a new one.
                else {
                    if (type === IMAGE_SYMBOL_TYPE) {
                        if (this.imageAtlasMap[key] === undefined) {
                            throw new Error(`Cannot find image symbol ${key} in ${this.key}.`);
                        }
                        symbol = new Symbol(this.game, 0, 0, this.imageAtlasMap[key], key); // Allocation
                    }
                    else {
                        if (this.movieMap[key] === undefined) {
                            throw new Error(`Cannot find movie symbol ${key} in ${this.key}.`);
                        }
                        symbol = new Movie(this.game, this.movieMap[key], this.frameRate); // Allocation
                    }
                }
                break;

            default: 
                throw new Error(`Cannot get the symbol ${key} in ${this.key}.`);
        }

        symbol.symbolType = type;
        symbol.symbolKey = symbolKey;
        symbol.symbolLibrary = this.key;

        // Return the symbol.
        return symbol;
    }

    /**
     * Store the provided symbol in this library.
     * Only symbols created from this library using the Library::create() function can be store in this library.
     * @param {Symbol | Movie} symbol 
     */
    storeSymbol(symbol) {
        if (this.isDestroyed) {
            // Ideally we will never get here, however throw an error in case the user tries to use the library after it was removed from the plugin.
            throw new Error(`${this.key} has been destroyed and no longer can store symbols. Use Symbol::destroy() instead.`);
        }
        if (symbol.symbolLibrary === undefined || symbol.symbolLibrary !== this.key) {
            throw new Error('The provided symbol does not belong to this library.');
        }

        const type = symbol.symbolType;
        switch (type) {
            case EMPTY_SYMBOL_TYPE:
                if (this.symbolPools[EMPTY_SYMBOL_TYPE].indexOf(symbol) >= 0) {
                    throw new Error("Attempting to store a symbol that is already in storage. Symbols in storages should not be referenced.");
                }
                this.symbolPools[EMPTY_SYMBOL_TYPE].push(symbol);
                break;

            case MOVIE_SYMBOL_TYPE:
            case IMAGE_SYMBOL_TYPE:
                const key = symbol.symbolKey

                this.symbolPools[type][key] = this.symbolPools[type][key] || [];
                if (this.symbolPools[type][key].indexOf(symbol) >= 0) {
                    throw new Error("Attempting to store a symbol that is already in storage. Symbols in storages should not be referenced.");
                }
                this.symbolPools[type][key].push(symbol);
                break;

            default: 
                throw new Error(`Cannot store the symbol ${key} in ${this.key}.`);
        }
    }

    /**
     * Generates the frame data for the loaded library atlas pngs and updates the cached image data.
     */
    generateFrameData() {
        if (this.isDestroyed) {
            return;
        }

        const textureGroups = this.data.textureGroups;
        if (textureGroups === undefined) {
            throw new Error(`Library JSON for ${this.key} is missing the 'textureGroups' field (Array).`);
        }

        // Begin generating frame data for each texture group.
        textureGroups.forEach((group, i) => {
            if (group.atlases === undefined) {
                throw new Error(`Texture group ${i} for ${this.key} is missing the 'atlases' field (Array).`);
            }

            group.atlases.forEach((atlas, j) => {
                if (atlas.file === undefined) {
                    throw new Error(`Atlas ${j} in texture group ${i} for ${this.key} is missing the 'file' field (string).`);
                }
                if (atlas.textures === undefined) {
                    throw new Error(`Atlas ${j} in texture group ${i} for ${this.key} is missing the 'textures' field (Array).`);
                }

                const imgKey = `${this.key}/${atlas.file}`;
                // Verify the atlas png has been loaded.
                if (!this.game.cache.checkImageKey(imgKey)) {
                    throw new Error(`Cannot find image ${imgKey} in game cache.`);
                }

                // Add this atlas key to the library's atlas list.
                this.atlases.push(imgKey);

                const frameData = new Phaser.FrameData();
                atlas.textures.forEach((texture, k) => {
                    if (texture.symbol === undefined) {
                        throw new Error(`Texture ${k} on atlas ${j} in texture group ${i} for ${this.key} is missing the 'symbol' field (string).`);
                    }
                    if (texture.rect === undefined) {
                        throw new Error(`Texture ${k} on atlas ${j} in texture group ${i} for ${this.key} is missing the 'rect' field (Array).`);
                    }
                    frameData.addFrame(new Phaser.Frame(k, texture.rect[0], texture.rect[1], texture.rect[2], texture.rect[3], texture.symbol));

                    // Set a reference to which atlas this texture symbol is in.
                    this.imageAtlasMap[texture.symbol] = imgKey;
                });

                // Replace the current frame data on the loaded atlas image with the frame data from the library's json data.
                const image = this.game.cache._cache.image[imgKey];
                image.frameData = frameData;
                image.frame = frameData.getFrame(0);
            });
        });
    }
}