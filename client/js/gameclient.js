
define(['player', 'entityfactory', 'lib/socket.io'], function(Player, EntityFactory, io) {

    var GameClient = Class.extend({
        init: function(host, port) {
            this.connection = null;
            this.host = host;
            this.port = port;
    
            this.connected_callback = null;
            this.spawn_callback = null;
            this.movement_callback = null;
        
            this.handlers = [];
            this.handlers[Types.Messages.WELCOME] = this.receiveWelcome;
            this.handlers[Types.Messages.MOVE] = this.receiveMove;
            this.handlers[Types.Messages.LOOTMOVE] = this.receiveLootMove;
            this.handlers[Types.Messages.ATTACK] = this.receiveAttack;
            this.handlers[Types.Messages.SPAWN] = this.receiveSpawn;
            this.handlers[Types.Messages.DESPAWN] = this.receiveDespawn;
            //this.handlers[Types.Messages.SPAWN_BATCH] = this.receiveSpawnBatch; I don't know why this is here
            this.handlers[Types.Messages.HEALTH] = this.receiveHealth;
            this.handlers[Types.Messages.CHAT] = this.receiveChat;
            this.handlers[Types.Messages.EQUIP] = this.receiveEquipItem;
            this.handlers[Types.Messages.DROP] = this.receiveDrop;
            this.handlers[Types.Messages.TELEPORT] = this.receiveTeleport;
            this.handlers[Types.Messages.DAMAGE] = this.receiveDamage;
            this.handlers[Types.Messages.POPULATION] = this.receivePopulation;
            this.handlers[Types.Messages.LIST] = this.receiveList;
            this.handlers[Types.Messages.DESTROY] = this.receiveDestroy;
            this.handlers[Types.Messages.KILL] = this.receiveKill;
            this.handlers[Types.Messages.HP] = this.receiveHitPoints;
            this.handlers[Types.Messages.BLINK] = this.receiveBlink;
        
            this.enable();
        },
    
        enable: function() {
            this.isListening = true;
        },
    
        disable: function() {
            this.isListening = false;
        },
        
        connect: function(dispatcherMode) {
            var url = "http://"+ this.host +":"+ this.port +"/",
                self = this;

            log.info("Trying to connect to server : "+url);

            this.connection = io(url);

            for(event in this.handlers) {
                if(_.isFunction(this.handlers[event])) {
                    this.connection.on(event, this.handlers[event].bind(this));
                } else {
                    log.error("Invalid event handler for: " + event);
                }
            }

            this.connection.on('connect', function(e) {
                log.info("Connected to server "+self.host+":"+self.port);

                if(self.connected_callback) {
                    self.connected_callback();
                }
            });

            this.connection.on('error', function(e) {
                log.error(e, true);
            });

            this.connection.on('disconnect', function() {
                log.debug("Connection closed");
                $('#container').addClass('error');
                
                if(self.disconnected_callback) {
                    if(self.isTimeout) {
                        self.disconnected_callback("You have been disconnected for being inactive for too long");
                    } else {
                        self.disconnected_callback("The connection to BrowserQuest has been lost");
                    }
                }
            });
        },
    
        receiveWelcome: function(id, name, x, y, hp) {
            if(this.welcome_callback) {
                this.welcome_callback(id, name, x, y, hp);
            }
        },
    
        receiveMove: function(id, x, y) {
            if(this.move_callback) {
                this.move_callback(id, x, y);
            }
        },
    
        receiveLootMove: function(id, item) {
            if(this.lootmove_callback) {
                this.lootmove_callback(id, item);
            }
        },
    
        receiveAttack: function(attacker, target) {
            if(this.attack_callback) {
                this.attack_callback(attacker, target);
            }
        },
    
        receiveSpawn: function(id, kind, x, y) {
            var data = arguments;

            if(Types.isItem(kind)) {
                var item = EntityFactory.createEntity(kind, id);
            
                if(this.spawn_item_callback) {
                    this.spawn_item_callback(item, x, y);
                }
            } else if(Types.isChest(kind)) {
                var item = EntityFactory.createEntity(kind, id);
            
                if(this.spawn_chest_callback) {
                    this.spawn_chest_callback(item, x, y);
                }
            } else {
                var name, orientation, target, weapon, armor;
            
                if(Types.isPlayer(kind)) {
                    name = data[5];
                    orientation = data[6];
                    armor = data[7];
                    weapon = data[8];
                    if(data.length > 9) {
                        target = data[9];
                    }
                }
                else if(Types.isMob(kind)) {
                    orientation = data[5];
                    if(data.length > 6) {
                        target = data[6];
                    }
                }

                var character = EntityFactory.createEntity(kind, id, name);
            
                if(character instanceof Player) {
                    character.weaponName = Types.getKindAsString(weapon);
                    character.spriteName = Types.getKindAsString(armor);
                }
            
                if(this.spawn_character_callback) {
                    this.spawn_character_callback(character, x, y, orientation, target);
                }
            }
        },
    
        receiveDespawn: function(id) {        
            if(this.despawn_callback) {
                this.despawn_callback(id);
            }
        },
    
        receiveHealth: function(points, regen) {
            var isRegen = false;
        
            if(regen) {
                isRegen = true;
            }
        
            if(this.health_callback) {
                this.health_callback(points, isRegen);
            }
        },
    
        receiveChat: function(id, text) {
            if(this.chat_callback) {
                this.chat_callback(id, text);
            }
        },
    
        receiveEquipItem: function(id, itemKind) {
            if(this.equip_callback) {
                this.equip_callback(id, itemKind);
            }
        },
    
        receiveDrop: function(mobId, id, kind, playersInvolved) {
            var item = EntityFactory.createEntity(kind, id);
            item.wasDropped = true;
            item.playersInvolved = playersInvolved;
        
            if(this.drop_callback) {
                this.drop_callback(item, mobId);
            }
        },
    
        receiveTeleport: function(id, x, y) {
            if(this.teleport_callback) {
                this.teleport_callback(id, x, y);
            }
        },
    
        receiveDamage: function(id, dmg) {
            if(this.dmg_callback) {
                this.dmg_callback(id, dmg);
            }
        },
    
        receivePopulation: function(worldPlayers, totalPlayers) {
            if(this.population_callback) {
                this.population_callback(worldPlayers, totalPlayers);
            }
        },
    
        receiveKill: function(mobKind) {
            if(this.kill_callback) {
                this.kill_callback(mobKind);
            }
        },
    
        receiveList: function(args) {
            if(this.list_callback) {
                this.list_callback(arguments);
            }
        },
    
        receiveDestroy: function(id) {        
            if(this.destroy_callback) {
                this.destroy_callback(id);
            }
        },
    
        receiveHitPoints: function(maxHp) {        
            if(this.hp_callback) {
                this.hp_callback(maxHp);
            }
        },
    
        receiveBlink: function(id) {
            if(this.blink_callback) {
                this.blink_callback(id);
            }
        },
        
        onDispatched: function(callback) {
            this.dispatched_callback = callback;
        },

        onConnected: function(callback) {
            this.connected_callback = callback;
        },
        
        onDisconnected: function(callback) {
            this.disconnected_callback = callback;
        },

        onWelcome: function(callback) {
            this.welcome_callback = callback;
        },

        onSpawnCharacter: function(callback) {
            this.spawn_character_callback = callback;
        },
    
        onSpawnItem: function(callback) {
            this.spawn_item_callback = callback;
        },
    
        onSpawnChest: function(callback) {
            this.spawn_chest_callback = callback;
        },

        onDespawnEntity: function(callback) {
            this.despawn_callback = callback;
        },

        onEntityMove: function(callback) {
            this.move_callback = callback;
        },

        onEntityAttack: function(callback) {
            this.attack_callback = callback;
        },
    
        onPlayerChangeHealth: function(callback) {
            this.health_callback = callback;
        },
    
        onPlayerEquipItem: function(callback) {
            this.equip_callback = callback;
        },
    
        onPlayerMoveToItem: function(callback) {
            this.lootmove_callback = callback;
        },
    
        onPlayerTeleport: function(callback) {
            this.teleport_callback = callback;
        },
    
        onChatMessage: function(callback) {
            this.chat_callback = callback;
        },
    
        onDropItem: function(callback) {
            this.drop_callback = callback;
        },
    
        onPlayerDamageMob: function(callback) {
            this.dmg_callback = callback;
        },
    
        onPlayerKillMob: function(callback) {
            this.kill_callback = callback;
        },
    
        onPopulationChange: function(callback) {
            this.population_callback = callback;
        },
    
        onEntityList: function(callback) {
            this.list_callback = callback;
        },
    
        onEntityDestroy: function(callback) {
            this.destroy_callback = callback;
        },
    
        onPlayerChangeMaxHitPoints: function(callback) {
            this.hp_callback = callback;
        },
    
        onItemBlink: function(callback) {
            this.blink_callback = callback;
        },

        sendHello: function(player) {
            this.connection.emit(Types.Messages.HELLO, player.name,
                Types.getKindFromString(player.getSpriteName()),
                Types.getKindFromString(player.getWeaponName()) );
        },

        sendMove: function(x, y) {
            this.connection.emit(Types.Messages.MOVE, x, y);
        },
    
        sendLootMove: function(item, x, y) {
            this.connection.emit(Types.Messages.LOOTMOVE, item.id, x, y);
        },
    
        sendAggro: function(mob) {
            this.connection.emit(Types.Messages.AGGRO, mob.id);
        },
    
        sendAttack: function(mob) {
            this.connection.emit(Types.Messages.ATTACK, mob.id);
        },
    
        sendHit: function(mob) {
            this.connection.emit(Types.Messages.HIT, mob.id);
        },
    
        sendHurt: function(mob) {
            this.connection.emit(Types.Messages.HURT, mob.id);
        },
    
        sendChat: function(text) {
            this.connection.emit(Types.Messages.CHAT, text);
        },
    
        sendLoot: function(item) {
            this.connection.emit(Types.Messages.LOOT, item.id);
        },
    
        sendTeleport: function(x, y) {
            this.connection.emit(Types.Messages.TELEPORT, x, y);
        },
    
        sendWho: function(ids) {
            this.connection.emit(Types.Messages.WHO, ids);
        },
    
        sendZone: function() {
            this.connection.emit(Types.Messages.ZONE);
        },
    
        sendOpen: function(chest) {
            this.connection.emit(Types.Messages.OPEN, chest.id);
        },
    
        sendCheck: function(id) {
            this.connection.emit(Types.Messages.CHECK, id);
        }
    });
    
    return GameClient;
});