
var cls = require("./lib/class"),
    _ = require("underscore"),
    Messages = require("./message"),
    Utils = require("./utils"),
    Properties = require("./properties"),
    Formulas = require("./formulas"),
    check = require("./format").check,
    Types = require("../../shared/js/gametypes");

module.exports = Player = Character.extend({
    init: function(connection, worldServer) {
        var self = this;
        
        this.server = worldServer;
        this.connection = connection;

        this._super(this.connection.id, "player", Types.Entities.WARRIOR, 0, 0, "");

        this.hasEnteredGame = false;
        this.isDead = false;
        this.haters = {};
        this.lastCheckpoint = null;
        this.formatChecker = new FormatChecker();
        this.disconnectTimeout = null;

        this.connection.on(Types.Messages.HELLO, function(dirty_name, armor, weapon) {
            if(self.hasEnteredGame && !self.isDead) {
                self.connection.emit("error", "Cannot initiate handshake twice.");
                self.connection.close();
                return;
            }

            var name = Utils.sanitize(dirty_name);
            
            // If name was cleared by the sanitizer, give a default name.
            // Always ensure that the name is not longer than a maximum length.
            // (also enforced by the maxlength attribute of the name input element).
            self.name = (name === "") ? "lorem ipsum" : name.substr(0, 15);
            
            self.kind = Types.Entities.WARRIOR;
            self.equipArmor(armor);
            self.equipWeapon(weapon);
            self.orientation = Utils.randomOrientation();
            self.updateHitPoints();
            self.updatePosition();
            
            self.server.addPlayer(self);
            self.server.enter_callback(self);

            self.send([Types.Messages.WELCOME, self.id, self.name, self.x, self.y, self.hitPoints]);
            self.hasEnteredGame = true;
            self.isDead = false;
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.WHO, function(ids) {
            self.server.pushSpawnsToPlayer(self, ids);
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.ZONE, function() {
            self.zone_callback();
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.CHAT, function(text) {
            var msg = Utils.sanitize(text);
            
            // Sanitized messages may become empty. No need to broadcast empty chat messages.
            if(msg && msg !== "") {
                msg = msg.substr(0, 60); // Enforce maxlength of chat input
                self.broadcastToZone(new Messages.Chat(self, msg), false);
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.MOVE, function(x, y) {
            if(self.move_callback) {
                
                if(self.server.isValidPosition(x, y)) {
                    self.setPosition(x, y);
                    self.clearTarget();
                    
                    self.broadcast(new Messages.Move(self));
                    self.move_callback(self.x, self.y);
                }
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.LOOTMOVE, function(itemId, x, y) {
            if(self.lootmove_callback) {
                self.setPosition(x, y);
                
                var item = self.server.getEntityById(itemId);
                if(item) {
                    self.clearTarget();

                    self.broadcast(new Messages.LootMove(self, item));
                    self.lootmove_callback(self.x, self.y);
                }
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.AGGRO, function(mobId) {
            if(self.move_callback) {
                self.server.handleMobHate(mobId, self.id, 5);
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.ATTACK, function(mobId) {
            var mob = self.server.getEntityById(mobId);
            
            if(mob) {
                self.setTarget(mob);
                self.server.broadcastAttacker(self);
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.HIT, function(mobId) {
            var mob = self.server.getEntityById(mobId);
            if(mob) {
                var dmg = Formulas.dmg(self.weaponLevel, mob.armorLevel);
                
                if(dmg > 0) {
                    mob.receiveDamage(dmg, self.id);
                    self.server.handleMobHate(mob.id, self.id, dmg);
                    self.server.handleHurtEntity(mob, self, dmg);
                }
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.HURT, function(mobId) {
            var mob = self.server.getEntityById(mobId);
            if(mob && self.hitPoints > 0) {
                self.hitPoints -= Formulas.dmg(mob.weaponLevel, self.armorLevel);
                self.server.handleHurtEntity(self);
                
                if(self.hitPoints <= 0) {
                    self.isDead = true;
                    if(self.firepotionTimeout) {
                        clearTimeout(self.firepotionTimeout);
                    }
                }
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.LOOT, function(itemId) {
            var item = self.server.getEntityById(itemId);
            
            if(item) {
                var kind = item.kind;
                
                if(Types.isItem(kind)) {
                    self.broadcast(item.despawn());
                    self.server.removeEntity(item);
                    
                    if(kind === Types.Entities.FIREPOTION) {
                        self.updateHitPoints();
                        self.broadcast(self.equip(Types.Entities.FIREFOX));
                        self.firepotionTimeout = setTimeout(function() {
                            self.broadcast(self.equip(self.armor)); // return to normal after 15 sec
                            self.firepotionTimeout = null;
                        }, 15000);
                        self.send(new Messages.HitPoints(self.maxHitPoints).serialize());
                    } else if(Types.isHealingItem(kind)) {
                        var amount;
                        
                        switch(kind) {
                            case Types.Entities.FLASK: 
                                amount = 40;
                                break;
                            case Types.Entities.BURGER: 
                                amount = 100;
                                break;
                        }
                        
                        if(!self.hasFullHealth()) {
                            self.regenHealthBy(amount);
                            self.server.pushToPlayer(self, self.health());
                        }
                    } else if(Types.isArmor(kind) || Types.isWeapon(kind)) {
                        self.equipItem(item);
                        self.broadcast(self.equip(kind));
                    }
                }
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.TELEPORT, function(x, y) {
            
            if(self.server.isValidPosition(x, y)) {
                self.setPosition(x, y);
                self.clearTarget();
                
                self.broadcast(new Messages.Teleport(self));
                
                self.server.handlePlayerVanish(self);
                self.server.pushRelevantEntityListTo(self);
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.OPEN, function(chestId) {
            var chest = self.server.getEntityById(chestId);
            if(chest && chest instanceof Chest) {
                self.server.handleOpenedChest(chest, self);
            }
            self.resetTimeout();
        });

        this.connection.on(Types.Messages.CHECK, function(id) {
            var checkpoint = self.server.map.getCheckpoint(id);
            if(checkpoint) {
                self.lastCheckpoint = checkpoint;
            }
            self.resetTimeout();
        });
        
        this.connection.on('disconnect', function() {
            if(self.firepotionTimeout) {
                clearTimeout(self.firepotionTimeout);
            }
            clearTimeout(self.disconnectTimeout);
            if(self.exit_callback) {
                self.exit_callback();
            }
        });
        
        this.connection.emit("go"); // Notify client that the HELLO/WELCOME handshake can start
    },
    
    destroy: function() {
        var self = this;
        
        this.forEachAttacker(function(mob) {
            mob.clearTarget();
        });
        this.attackers = {};
        
        this.forEachHater(function(mob) {
            mob.forgetPlayer(self.id);
        });
        this.haters = {};
    },
    
    getState: function() {
        var basestate = this._getBaseState(),
            state = [this.name, this.orientation, this.armor, this.weapon];

        if(this.target) {
            state.push(this.target);
        }
        
        return basestate.concat(state);
    },
    
    send: function(args) {
        this.connection.emit.apply(this.connection, args);
    },
    
    broadcast: function(message, ignoreSelf) {
        if(this.broadcast_callback) {
            this.broadcast_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    broadcastToZone: function(message, ignoreSelf) {
        if(this.broadcastzone_callback) {
            this.broadcastzone_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    onExit: function(callback) {
        this.exit_callback = callback;
    },
    
    onMove: function(callback) {
        this.move_callback = callback;
    },
    
    onLootMove: function(callback) {
        this.lootmove_callback = callback;
    },
    
    onZone: function(callback) {
        this.zone_callback = callback;
    },
    
    onOrient: function(callback) {
        this.orient_callback = callback;
    },
    
    onMessage: function(callback) {
        this.message_callback = callback;
    },
    
    onBroadcast: function(callback) {
        this.broadcast_callback = callback;
    },
    
    onBroadcastToZone: function(callback) {
        this.broadcastzone_callback = callback;
    },
    
    equip: function(item) {
        return new Messages.EquipItem(this, item);
    },
    
    addHater: function(mob) {
        if(mob) {
            if(!(mob.id in this.haters)) {
                this.haters[mob.id] = mob;
            }
        }
    },
    
    removeHater: function(mob) {
        if(mob && mob.id in this.haters) {
            delete this.haters[mob.id];
        }
    },
    
    forEachHater: function(callback) {
        _.each(this.haters, function(mob) {
            callback(mob);
        });
    },
    
    equipArmor: function(kind) {
        this.armor = kind;
        this.armorLevel = Properties.getArmorLevel(kind);
    },
    
    equipWeapon: function(kind) {
        this.weapon = kind;
        this.weaponLevel = Properties.getWeaponLevel(kind);
    },
    
    equipItem: function(item) {
        if(item) {
            log.debug(this.name + " equips " + Types.getKindAsString(item.kind));
            
            if(Types.isArmor(item.kind)) {
                this.equipArmor(item.kind);
                this.updateHitPoints();
                this.send(new Messages.HitPoints(this.maxHitPoints).serialize());
            } else if(Types.isWeapon(item.kind)) {
                this.equipWeapon(item.kind);
            }
        }
    },
    
    updateHitPoints: function() {
        this.resetHitPoints(Formulas.hp(this.armorLevel));
    },
    
    updatePosition: function() {
        if(this.requestpos_callback) {
            var pos = this.requestpos_callback();
            this.setPosition(pos.x, pos.y);
        }
    },
    
    onRequestPosition: function(callback) {
        this.requestpos_callback = callback;
    },
    
    resetTimeout: function() {
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(this.timeout.bind(this), 1000 * 60 * 15); // 15 min.
    },
    
    timeout: function() {
        this.connection.emit("timeout");
        this.connection.close("Player was idle for too long");
    }
});