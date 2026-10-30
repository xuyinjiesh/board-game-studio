// Eager entry for offline generation and synchronous model tests.
// Browser entry points use project-session.js and load one provider at a time.
import {grove,builtinAssets} from './games/grove.js';
import {ironHelm} from './games/iron-helm.js';
import {pocketPaladin} from './games/pocket-paladin.js';
import {northwood} from './games/for-northwood.js';
import {realms} from './games/52-realms.js';
import {miniRogue} from './games/mini-rogue.js';
import {clever} from './games/clever.js';
import {registerGame} from './game-registry.js';
export const examples=[grove,ironHelm,pocketPaladin,northwood,realms,miniRogue,clever];
for(const game of examples)registerGame(game,game===grove?builtinAssets:undefined);
export * from './project-session.js';
