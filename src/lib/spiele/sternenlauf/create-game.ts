/**
 * Sternenlauf — Phaser arcade skill runner for ages ~8–10.
 * Procedural obstacles + stars; jump via pointer / space / ↑.
 */

import * as Phaser from "phaser";
import {
  STERNENLAUF_HEIGHT,
  STERNENLAUF_WIDTH,
} from "@/lib/spiele/sternenlauf/constants";

export type SternenlaufHud = {
  onScore: (score: number) => void;
  onBest: (best: number) => void;
  onState: (state: "ready" | "playing" | "over") => void;
};

const GROUND_Y = 390;
const PLAYER_X = 140;
const GRAVITY = 1600;
const JUMP_V = -620;
const BASE_SPEED = 260;
const MAX_SPEED = 520;
const BEST_KEY = "leseno-sternenlauf-best";

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Boots Phaser into `parent`. Returns a destroy callback for React cleanup.
 */
export function createSternenlaufGame(
  parent: HTMLElement,
  hud: SternenlaufHud,
): () => void {
  let bestScore = readBest();

  class SternenlaufScene extends Phaser.Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private ground!: Phaser.Physics.Arcade.StaticGroup;
    private obstacles!: Phaser.Physics.Arcade.Group;
    private stars!: Phaser.Physics.Arcade.Group;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private spaceKey?: Phaser.Input.Keyboard.Key;
    private scoreStars = 0;
    private distance = 0;
    private speed = BASE_SPEED;
    private runState: "ready" | "playing" | "over" = "ready";
    private spawnTimer = 0;
    private canJump = false;
    private jumpBuffered = false;
    private hint?: Phaser.GameObjects.Text;

    constructor() {
      super("Sternenlauf");
    }

    create() {
      this.makeTextures();

      this.add
        .rectangle(0, 0, STERNENLAUF_WIDTH, STERNENLAUF_HEIGHT, 0xbfdbfe)
        .setOrigin(0)
        .setDepth(-3);
      this.add
        .rectangle(0, 260, STERNENLAUF_WIDTH, 200, 0xd9f99d)
        .setOrigin(0)
        .setDepth(-2)
        .setAlpha(0.5);

      for (const [cx, cy, s] of [
        [120, 70, 1],
        [340, 50, 0.8],
        [560, 90, 1.1],
        [720, 55, 0.7],
      ] as const) {
        this.add.circle(cx, cy, 28 * s, 0xffffff, 0.85).setDepth(-1);
        this.add
          .circle(cx + 22 * s, cy + 4, 22 * s, 0xffffff, 0.85)
          .setDepth(-1);
        this.add
          .circle(cx - 20 * s, cy + 6, 20 * s, 0xffffff, 0.85)
          .setDepth(-1);
      }

      this.ground = this.physics.add.staticGroup();
      for (let x = 0; x < STERNENLAUF_WIDTH + 64; x += 64) {
        this.ground.create(x + 32, GROUND_Y + 32, "ground").refreshBody();
      }

      this.player = this.physics.add.sprite(PLAYER_X, GROUND_Y - 28, "hero");
      this.player.setCollideWorldBounds(true);
      this.player.setDepth(5);
      this.player.body!.setSize(26, 34);
      this.player.setOffset(5, 8);

      this.physics.add.collider(this.player, this.ground, () => {
        this.canJump = true;
      });

      this.obstacles = this.physics.add.group();
      this.stars = this.physics.add.group();

      this.physics.add.overlap(this.player, this.obstacles, () =>
        this.gameOver(),
      );
      this.physics.add.overlap(this.player, this.stars, (_p, star) => {
        const s = star as Phaser.Physics.Arcade.Sprite;
        if (!s.active) return;
        s.disableBody(true, true);
        this.scoreStars += 5;
        this.pushScore();
        this.tweens.add({
          targets: this.player,
          scaleX: 1.12,
          scaleY: 1.12,
          duration: 70,
          yoyo: true,
        });
      });

      const kb = this.input.keyboard;
      this.input.on("pointerdown", () => this.tryJump());
      if (kb) {
        this.cursors = kb.createCursorKeys();
        this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.spaceKey.on("down", () => this.tryJump());
        this.cursors.up?.on("down", () => this.tryJump());
      }

      this.hint = this.add
        .text(
          STERNENLAUF_WIDTH / 2,
          118,
          "Tippen oder Leertaste — und spring!",
          {
            fontFamily: "Nunito, system-ui, sans-serif",
            fontSize: "22px",
            color: "#14532d",
            fontStyle: "bold",
          },
        )
        .setOrigin(0.5)
        .setDepth(20);

      hud.onBest(bestScore);
      hud.onScore(0);
      hud.onState("ready");
    }

    private makeTextures() {
      if (this.textures.exists("ground")) return;

      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x4d7c0f, 1);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x65a30d, 1);
      g.fillRect(0, 0, 64, 14);
      g.generateTexture("ground", 64, 64);
      g.clear();

      g.fillStyle(0x0f766e, 1);
      g.fillRoundedRect(4, 8, 28, 32, 8);
      g.fillStyle(0xfef3c7, 1);
      g.fillCircle(18, 14, 7);
      g.fillStyle(0xf59e0b, 1);
      g.fillRoundedRect(8, 28, 20, 10, 4);
      g.generateTexture("hero", 36, 44);
      g.clear();

      g.fillStyle(0xb91c1c, 1);
      g.fillRoundedRect(0, 8, 36, 28, 6);
      g.fillStyle(0xfca5a5, 1);
      g.fillTriangle(18, 0, 34, 28, 2, 28);
      g.generateTexture("spike", 36, 36);
      g.clear();

      g.fillStyle(0x9a3412, 1);
      g.fillRoundedRect(0, 0, 28, 56, 6);
      g.fillStyle(0xfb923c, 1);
      g.fillRect(5, 10, 18, 8);
      g.fillRect(5, 28, 18, 8);
      g.generateTexture("crate", 28, 56);
      g.clear();

      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(12, 12, 11);
      g.fillStyle(0xfffbeb, 1);
      g.fillCircle(12, 12, 5);
      g.generateTexture("star", 24, 24);
      g.destroy();
    }

    private displayScore() {
      return Math.floor(this.distance / 8) + this.scoreStars;
    }

    private lastPushedScore = -1;

    /** Notify React HUD only when the integer score changes (avoid per-frame setState). */
    private pushScore() {
      const next = this.displayScore();
      if (next === this.lastPushedScore) return;
      this.lastPushedScore = next;
      hud.onScore(next);
    }

    private tryJump() {
      if (this.runState === "ready") {
        this.runState = "playing";
        hud.onState("playing");
        this.hint?.destroy();
        this.hint = undefined;
        this.scoreStars = 0;
        this.distance = 0;
        this.speed = BASE_SPEED;
        this.spawnTimer = 700;
        this.pushScore();
        this.player.setVelocityY(JUMP_V);
        this.canJump = false;
        return;
      }
      if (this.runState === "over") {
        this.scene.restart();
        return;
      }
      if (this.canJump) {
        this.player.setVelocityY(JUMP_V);
        this.canJump = false;
        this.jumpBuffered = false;
      } else {
        this.jumpBuffered = true;
      }
    }

    private gameOver() {
      if (this.runState !== "playing") return;
      this.runState = "over";
      hud.onState("over");
      this.player.setVelocity(0, 0);
      this.player.setTint(0xf87171);
      this.obstacles.getChildren().forEach((c) => {
        (c as Phaser.Physics.Arcade.Sprite).setVelocityX(0);
      });
      this.stars.getChildren().forEach((c) => {
        (c as Phaser.Physics.Arcade.Sprite).setVelocityX(0);
      });

      const finalScore = this.displayScore();
      if (finalScore > bestScore) {
        bestScore = finalScore;
        hud.onBest(bestScore);
        writeBest(bestScore);
      }

      this.add
        .text(
          STERNENLAUF_WIDTH / 2,
          130,
          `Autsch! Score ${finalScore}\nTippen zum Neustart`,
          {
            fontFamily: "Nunito, system-ui, sans-serif",
            fontSize: "24px",
            color: "#7f1d1d",
            fontStyle: "bold",
            align: "center",
            lineSpacing: 8,
          },
        )
        .setOrigin(0.5)
        .setDepth(30);
    }

    private spawnObstacle() {
      const kind = Math.random() < 0.6 ? "spike" : "crate";
      const h = kind === "spike" ? 36 : 56;
      const y = GROUND_Y - h / 2;
      const ob = this.obstacles.create(
        STERNENLAUF_WIDTH + 40,
        y,
        kind,
      ) as Phaser.Physics.Arcade.Sprite;
      ob.setVelocityX(-this.speed);
      ob.setImmovable(true);
      (ob.body as Phaser.Physics.Arcade.Body).allowGravity = false;
      if (kind === "spike") {
        ob.body!.setSize(28, 24);
        ob.setOffset(4, 10);
      } else {
        ob.body!.setSize(24, 50);
        ob.setOffset(2, 4);
      }

      if (Math.random() < 0.75) {
        const star = this.stars.create(
          STERNENLAUF_WIDTH + 90 + Math.random() * 50,
          GROUND_Y - 85 - Math.random() * 55,
          "star",
        ) as Phaser.Physics.Arcade.Sprite;
        star.setVelocityX(-this.speed);
        (star.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        this.tweens.add({
          targets: star,
          y: star.y - 12,
          duration: 480,
          yoyo: true,
          repeat: -1,
        });
      }
    }

    update(_t: number, delta: number) {
      if (this.runState !== "playing") return;

      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.blocked.down || body.touching.down) {
        this.canJump = true;
        if (this.jumpBuffered) {
          this.jumpBuffered = false;
          this.player.setVelocityY(JUMP_V);
          this.canJump = false;
        }
      }

      this.distance += (this.speed * delta) / 1000;
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.distance * 0.09);
      this.pushScore();

      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        this.spawnObstacle();
        const gap =
          Phaser.Math.Between(850, 1350) - (this.speed - BASE_SPEED) * 0.7;
        this.spawnTimer = Math.max(620, gap);
      }

      this.obstacles.getChildren().forEach((child) => {
        const s = child as Phaser.Physics.Arcade.Sprite;
        s.setVelocityX(-this.speed);
        if (s.x < -80) s.destroy();
      });
      this.stars.getChildren().forEach((child) => {
        const s = child as Phaser.Physics.Arcade.Sprite;
        s.setVelocityX(-this.speed);
        if (s.x < -80) s.destroy();
      });

      if (this.canJump) {
        this.player.setAngle(Math.sin(this.distance / 7) * 5);
      } else {
        this.player.setAngle(-14);
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: STERNENLAUF_WIDTH,
    height: STERNENLAUF_HEIGHT,
    backgroundColor: "#bfdbfe",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: GRAVITY },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [SternenlaufScene],
    audio: { noAudio: true },
  });

  return () => {
    game.destroy(true);
  };
}
