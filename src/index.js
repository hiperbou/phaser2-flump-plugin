import 'phaser-ce';

class FlumpPlugin extends Phaser.Plugin {
    constructor(game, parent) {
        super(game, parent);
        this.game.flump = this.game.flump || this;
    }
}

Phaser.Plugin.Flump = FlumpPlugin;