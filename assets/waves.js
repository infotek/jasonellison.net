            const ParticleOffsets = {
                BASE_X: 0,
                BASE_Z: 1,
                BASE_Y: 2,
                R: 3,
                G: 4,
                B: 5,
                PERSPECTIVE_SIZE: 6,
                HALF_SIZE: 7,
                PERSPECTIVE_DEPTH_ALPHA: 8,
                PARTICLE_SIZE: 9,
            };

            class WavesCanvas {
                width = 0;
                height = 0;
                dpi = Math.max(1, devicePixelRatio);

                turbulence = Math.PI * 6.0;
                pointSize = this.dpi;
                pointSizeCutoff = 5;
                speed = 10;
                waveHeight = 5;
                distance = 3;

                fov = (60 * Math.PI) / 180;
                aspectRatio = 1;
                cameraZ = 95;

                lodThreshold = this.cameraZ * 0.9;
                f = Math.tan(Math.PI * 0.5 - 0.5 * this.fov);

                #particleData = new Float32Array(0);
                #particleOffsetCount = 0;

                #buffer;
                #sample;

                #gridWidth = 0;
                #gridDepth = 0;
                #fieldWidth = 0;
                #fieldHeight = 0;
                #fieldDepth = 0;

                #relativeWidth = 0;
                #relativeHeight = 0;

                #frustumLeft = 0;
                #frustumRight = 0;
                #frustumTop = 0;
                #frustumBottom = 0;
                #frustumNear = 0;
                #frustumFar = 0;

                #canvas;
                #ctx;
                #drawShape;

                constructor(target, shape = "circle") {
                    const element = typeof target === "string" ? document.querySelector(target) : target;

                    if (!(element instanceof HTMLCanvasElement)) {
                        throw new TypeError("Invalid canvas element");
                    }

                    this.#canvas = element;

                    const ctx = this.#canvas.getContext("2d", {
                        alpha: false,
                        desynchronized: true,
                    });

                    if (!ctx) {
                        throw new TypeError("Failed to get 2D context");
                    }

                    this.#ctx = ctx;

                    this.#canvas.style.background = getComputedStyle(document.body).backgroundColor;
                    this.#canvas.style.contain = "strict";
                    this.#canvas.style.willChange = "transform";
                    this.#canvas.style.transform = "translate3d(0, 0, 0)";
                    this.#canvas.style.pointerEvents = "none";

                    this.#drawShape =
                        shape === "circle" ? this.#drawCircleParticle : this.#drawTriangleParticle;

                    window.addEventListener("resize", this.refresh);
                }

                refresh = () => {
                    const container = this.#canvas.parentElement;
                    if (!container) return;

                    this.width = container.offsetWidth;
                    this.height = container.offsetHeight;
                    this.aspectRatio = this.width / this.height;

                    this.#relativeWidth = this.width * this.dpi;
                    this.#relativeHeight = this.height * this.dpi;

                    this.#canvas.width = this.#relativeWidth;
                    this.#canvas.height = this.#relativeHeight;

                    this.#canvas.style.width = this.width + "px";
                    this.#canvas.style.height = this.height + "px";

                    this.#ctx.scale(this.dpi, this.dpi);

                    this.#buffer = this.#ctx.createImageData(this.width * this.dpi, this.height * this.dpi);

                    this.#gridWidth = 300 * this.aspectRatio;
                    this.#gridDepth = 300;

                    this.#fieldWidth = this.#gridWidth;
                    this.#fieldHeight = this.waveHeight * this.aspectRatio;
                    this.#fieldDepth = this.#gridDepth;

                    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
                    if (prefersReducedMotion.matches) {
                        this.speed = 5;
                    }

                    this.#calculateFrustumBounds();
                    this.#generateParticles();

                    this.#ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
                    this.#ctx.fillRect(0, 0, this.#relativeWidth, this.#relativeHeight);

                    this.#sample = this.#ctx.getImageData(0, 0, 1, 1).data;
                };

                #calculateFrustumBounds() {
                    const halfFov = this.fov / 2;
                    const tanHalfFov = Math.tan(halfFov);

                    this.#frustumNear = 1;
                    this.#frustumFar = this.cameraZ + this.#gridDepth;

                    const nearHeight = 2 * this.#frustumNear * tanHalfFov;
                    const nearWidth = nearHeight * this.aspectRatio;

                    this.#frustumLeft = -nearWidth / 2;
                    this.#frustumRight = nearWidth / 2;
                    this.#frustumTop = -1 * (this.aspectRatio / this.height);
                    this.#frustumBottom = -1.25 * nearHeight;
                }

                #isInFrustum(x, y, z) {
                    const projectedZ = z + this.cameraZ;
                    if (projectedZ <= this.#frustumNear || projectedZ > this.#frustumFar) {
                        return false;
                    }

                    const scale = projectedZ / this.#frustumNear;
                    const left = this.#frustumLeft * scale;
                    const right = this.#frustumRight * scale;
                    const top = this.#frustumTop * scale;
                    const bottom = this.#frustumBottom * scale;

                    return x >= left && x <= right && y >= bottom && y <= top;
                }

                #generateParticles() {
                    const particleCount =
                        Math.floor(this.#gridWidth / this.distance) *
                        Math.floor(this.#gridDepth / this.distance);

                    this.#particleData = new Float32Array(particleCount * ParticleOffsets.PARTICLE_SIZE);
                    this.#particleOffsetCount = this.#particleData.length / ParticleOffsets.PARTICLE_SIZE;

                    let particleIndex = 0;

                    for (let x = 0; x < this.#gridWidth; x += this.distance) {
                        const baseX = Math.round(-this.#gridWidth / 2 + x);

                        for (let z = 0; z < this.#gridDepth; z += this.distance) {
                            const baseZ = -this.#gridDepth / 2 + z;
                            const horizonFactor = Math.max(0.1, (x / this.#gridWidth) * 1);

                            const projectedZ = baseZ + this.cameraZ;
                            const baseSize = (this.height / 250) * this.pointSize * this.dpi;

                            const normalizedDepth = Math.max(0, (projectedZ - 50) / 200);
                            const logScale = Math.log(1 + normalizedDepth * 4) / Math.log(6);
                            const distanceFactor = Math.max(0.05, 1 - logScale);
                            const perspectiveSize = baseSize * distanceFactor * 3;

                            const depthAlpha = Math.max(0.6, Math.pow(distanceFactor, 2));

                            const offset = particleIndex * ParticleOffsets.PARTICLE_SIZE;

                            this.#particleData[offset + ParticleOffsets.BASE_X] = baseX;
                            this.#particleData[offset + ParticleOffsets.BASE_Z] = baseZ;
                            this.#particleData[offset + ParticleOffsets.BASE_Y] = this.cameraZ * -0.4;

                            // Monochrome Green Phosphor Palette
                            this.#particleData[offset + ParticleOffsets.R] = 0;
                            this.#particleData[offset + ParticleOffsets.G] = Math.min(
                                Math.floor(220 / horizonFactor),
                                255,
                            );
                            this.#particleData[offset + ParticleOffsets.B] = 0;

                            this.#particleData[offset + ParticleOffsets.PERSPECTIVE_SIZE] = perspectiveSize;
                            this.#particleData[offset + ParticleOffsets.HALF_SIZE] = Math.max(
                                1,
                                Math.round(perspectiveSize / 1.5),
                            );
                            this.#particleData[offset + ParticleOffsets.PERSPECTIVE_DEPTH_ALPHA] =
                                depthAlpha ** 2;

                            particleIndex++;
                        }
                    }
                }

                project3DTo2D(x, y, z) {
                    const projectedX = (x * this.f) / this.aspectRatio;
                    const projectedY = y * this.f;
                    const projectedZ = z + this.cameraZ;

                    if (projectedZ <= 0) return null;

                    const screenX = ((projectedX / projectedZ) * this.width) / 2 + this.width / 2;
                    const screenY =
                        this.height / 2 - ((projectedY / projectedZ) * this.height) / 2 - this.cameraZ * 2;

                    return { x: screenX, y: screenY, z: projectedZ };
                }

                calculateWaveY(x, z, time) {
                    return (
                        (Math.cos((x / this.#fieldWidth) * this.turbulence + time * this.speed) +
                            Math.sin((z / this.#fieldDepth) * this.turbulence + time * this.speed)) *
                        this.#fieldHeight
                    );
                }

                #drawPointParticle(x, y, r, g, b, a) {
                    const data = this.#buffer.data;
                    const centerX = Math.round(x * this.dpi);
                    const centerY = Math.round(y * this.dpi);
                    const width = this.#relativeWidth;
                    const height = this.#relativeHeight;

                    if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
                        const index = (centerY * width + centerX) * 4;
                        const alpha = Math.round(a * 255);
                        const blendFactor = alpha * 1.25;

                        data[index] = Math.min(255, data[index] + (r * blendFactor) / 255);
                        data[index + 1] = Math.min(255, data[index + 1] + (g * blendFactor) / 255);
                        data[index + 2] = Math.min(255, data[index + 2] + (b * blendFactor) / 255);
                        data[index + 3] = 255;
                    }
                }

                #drawCircleParticle = (x, y, halfSize, r, g, b, a) => {
                    const data = this.#buffer.data;
                    const centerX = Math.round(x * this.dpi);
                    const centerY = Math.round(y * this.dpi);

                    const width = this.#relativeWidth;
                    const height = this.#relativeHeight;

                    const alpha = Math.round(a * 255);
                    const radius = halfSize;

                    for (let py = -radius; py <= radius; py++) {
                        for (let px = -radius; px <= radius; px++) {
                            const dist = Math.sqrt(px * px + py * py);

                            if (dist >= radius - 1 && dist <= radius) {
                                const xPixel = centerX + px;
                                const yPixel = centerY + py;

                                if (xPixel >= 0 && xPixel < width && yPixel >= 0 && yPixel < height) {
                                    const index = (yPixel * width + xPixel) * 4;
                                    const blendFactor = alpha * 1.25;

                                    data[index] = Math.min(255, data[index] + (r * blendFactor) / 255);
                                    data[index + 1] = Math.min(255, data[index + 1] + (g * blendFactor) / 255);
                                    data[index + 2] = Math.min(255, data[index + 2] + (b * blendFactor) / 255);
                                    data[index + 3] = 255;
                                }
                            }
                        }
                    }
                };

                #drawTriangleParticle = (x, y, halfSize, r, g, b, a) => {
                    const data = this.#buffer.data;
                    const centerX = Math.round(x * this.dpi);
                    const centerY = Math.round(y * this.dpi);

                    const width = this.#relativeWidth;
                    const height = this.#relativeHeight;

                    const alpha = Math.round(a * 255);

                    for (let py = -halfSize; py <= halfSize; py++) {
                        const normalizedHeight = (py + halfSize) / (2 * halfSize);
                        const triangleWidth = Math.round(halfSize * normalizedHeight);

                        for (let px = -triangleWidth; px <= triangleWidth; px++) {
                            const isLeftEdge = px === -triangleWidth;
                            const isRightEdge = px === triangleWidth;
                            const isBottomEdge = py === halfSize;

                            if (isLeftEdge || isRightEdge || isBottomEdge) {
                                const xPixel = centerX + px;
                                const yPixel = centerY + py;

                                if (xPixel >= 0 && xPixel < width && yPixel >= 0 && yPixel < height) {
                                    const index = (yPixel * width + xPixel) * 4;
                                    const blendFactor = alpha * 1.25;

                                    data[index] = Math.min(255, data[index] + (r * blendFactor) / 255);
                                    data[index + 1] = Math.min(255, data[index + 1] + (g * blendFactor) / 255);
                                    data[index + 2] = Math.min(255, data[index + 2] + (b * blendFactor) / 255);
                                    data[index + 3] = 255;
                                }
                            }
                        }
                    }
                };

                #render = (time = performance.now()) => {
                    const timestamp = time / 6000;

                    this.#buffer.data.fill(0);

                    for (let i = 0; i < this.#particleOffsetCount; i++) {
                        const offset = i * ParticleOffsets.PARTICLE_SIZE;

                        const baseX = this.#particleData[offset + ParticleOffsets.BASE_X];
                        const baseZ = this.#particleData[offset + ParticleOffsets.BASE_Z];
                        const baseY = this.#particleData[offset + ParticleOffsets.BASE_Y];

                        const waveY = this.calculateWaveY(baseX, baseZ, timestamp);
                        const worldY = baseY + waveY;

                        if (!this.#isInFrustum(baseX, worldY, baseZ)) {
                            continue;
                        }

                        const projected = this.project3DTo2D(baseX, worldY, baseZ);

                        if (
                            !projected ||
                            projected.x < -50 ||
                            projected.x > this.width + 50 ||
                            projected.y < 0 ||
                            projected.y > this.height + 50
                        ) {
                            continue;
                        }

                        const viewDistance = Math.abs(projected.z - this.cameraZ);
                        const perspectiveSize = this.#particleData[offset + ParticleOffsets.PERSPECTIVE_SIZE];

                        if (viewDistance > this.lodThreshold || perspectiveSize < this.pointSizeCutoff) {
                            this.#drawPointParticle(
                                projected.x,
                                projected.y,
                                this.#particleData[offset + ParticleOffsets.R],
                                this.#particleData[offset + ParticleOffsets.G],
                                this.#particleData[offset + ParticleOffsets.B],
                                this.#particleData[offset + ParticleOffsets.PERSPECTIVE_DEPTH_ALPHA],
                            );
                        } else {
                            this.#drawShape(
                                projected.x,
                                projected.y,
                                this.#particleData[offset + ParticleOffsets.HALF_SIZE],
                                this.#particleData[offset + ParticleOffsets.R],
                                this.#particleData[offset + ParticleOffsets.G],
                                this.#particleData[offset + ParticleOffsets.B],
                                this.#particleData[offset + ParticleOffsets.PERSPECTIVE_DEPTH_ALPHA],
                            );
                        }
                    }

                    for (let i = 0; i < this.#buffer.data.length; i += 4) {
                        this.#buffer.data[i] ||= this.#sample[0];
                        this.#buffer.data[i + 1] ||= this.#sample[1];
                        this.#buffer.data[i + 2] ||= this.#sample[2];
                        this.#buffer.data[i + 3] ||= this.#sample[3];
                    }

                    this.#ctx.putImageData(this.#buffer, 0, 0);

                    this.#renderFrameID = requestAnimationFrame(this.#render);
                };

                #renderFrameID = -1;

                play = () => {
                    this.refresh();
                    this.#render();
                };

                pause = () => {
                    cancelAnimationFrame(this.#renderFrameID);
                };

                // Resumes the existing frame without rebuilding the particle field.
                resume = () => {
                    this.#render();
                };
            }

            const canvas = document.getElementById("waves-canvas");
            const waves = new WavesCanvas(canvas);
            waves.play();

            // Pause the render loop while the tab is hidden to save CPU/battery.
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    waves.pause();
                } else {
                    waves.resume();
                }
            });
