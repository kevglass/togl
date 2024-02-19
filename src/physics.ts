
// MINI 2D PHYSICS
// ===============
// Port of https://github.com/xem/mini2Dphysics/tree/gh-pages

export enum ShapeType {
    CIRCLE = 0,
    RECTANGLE = 1,
}
export interface Vector2 {
    x: number;
    y: number;
}

export interface Collision {
    depth: number;
    normal: Vector2;
    start: Vector2;
    end: Vector2;
}

export interface Shape {
    type: number,
    center: Vector2,
    friction: number,
    restitution: number,
    mass: number,
    velocity: Vector2,
    acceleration: Vector2,
    angle: number,
    angularVelocity: number,
    angularAcceleration: number,
    bounds: number,
    width: number,
    height: number,
    inertia: number,
    faceNormals: Vector2[]
    vertices: Vector2[],
    angularDamp: number,
    damp: number;
}

const defaultAngularDamp = 1;
const defaultDamp = 5;

export interface PhysicsWorld {
    objects: Shape[];
    gravity: Vector2;
    collisionInfo: Collision;
    collisionInfoR1: Collision;
    collisionInfoR2: Collision;
}

export const physics = {
    createWorld(): PhysicsWorld {
        return {
            objects: [],
            gravity: physics.Vec2(0,100),
            collisionInfo: EmptyCollision(),
            collisionInfoR1: EmptyCollision(),
            collisionInfoR2: EmptyCollision(),
        }
    },

    renderDemoScene(canvas: HTMLCanvasElement, world: PhysicsWorld) {
        const c = canvas.getContext('2d');

        if (!c) {
            return;
        }

        // Reset
        canvas.width ^= 0; // Draw / Update scene

        c.strokeStyle = "white";

        const objects = world.objects;

        for (let i = objects.length; i--;) {
            // Draw
            // ----
            c.save();
            c.translate(objects[i].center.x, objects[i].center.y);
            c.rotate(objects[i].angle);

            // Circle
            if (!objects[i].type) {
                c.beginPath();
                c.arc(0, 0, objects[i].bounds, 0, 7);
                c.lineTo(0, 0);
                c.closePath();
                c.stroke();
            }

            // Rectangle
            else {
                c.strokeRect(-objects[i].width / 2, -objects[i].height / 2, objects[i].width, objects[i].height);
            }

            c.restore();
        }
    },

    startDemoScene(canvas: HTMLCanvasElement): void {
        const world = createDemoScene();

        setInterval(() => {
            physics.worldStep(60, world);
            physics.renderDemoScene(canvas, world);
        }, 16);
    },

    // New circle
    createCircle(world: PhysicsWorld, center: Vector2, radius: number, mass: number, friction: number, restitution: number): Shape {
        return createRigidShape(world, center, mass, friction, restitution, 0, radius);
    },

    // New rectangle
    createRectangle(world: PhysicsWorld, center: Vector2, width: number, height: number, mass: number, friction: number, restitution: number, rotate: boolean = false): Shape {
        return createRigidShape(world, center, mass, friction, restitution, 1, Math.hypot(width, height) / 2, width, height, rotate);
    },

    // Move a shape along a vector
    moveShape(shape: Shape, v: Vector2) {
        // Center
        shape.center = physics.addVec2(shape.center, v);

        // Rectangle (move vertex)
        if (shape.type) {
            for (let i = 4; i--;) {
                shape.vertices[i] = physics.addVec2(shape.vertices[i], v);
            }
        }
    },

    // Rotate a shape around its center
    rotateShape(shape: Shape, angle: number) {
        // Update angle
        shape.angle += angle;

        // Rectangle (rotate vertex)
        if (shape.type) {
            for (let i = 4; i--;) {
                shape.vertices[i] = physics.rotateVec2(shape.vertices[i], shape.center, angle);
            }
            computeRectNormals(shape);
        }
    },

    worldStep(fps: number, world: PhysicsWorld) {
        const objects = world.objects;

        for (let i = objects.length; i--;) {
            // Update position/rotation
            objects[i].velocity = physics.addVec2(objects[i].velocity, physics.scale(objects[i].acceleration, 1 / fps));
            physics.moveShape(objects[i], physics.scale(objects[i].velocity, 1 / fps));
            objects[i].angularVelocity += objects[i].angularAcceleration * 1 / fps;
            physics.rotateShape(objects[i], objects[i].angularVelocity * 1 / fps);
        }

        // Compute collisions
        for (let k = 9; k--;) {
            for (let i = objects.length; i--;) {
                for (let j = objects.length; j-- > i;) {

                    // Test bounds
                    if (boundTest(objects[i], objects[j])) {

                        // Test collision
                        if (testCollision(world, objects[i], objects[j], world.collisionInfo)) {

                            // Make sure the normal is always from object[i] to object[j]
                            if (physics.dotProduct(world.collisionInfo.normal, physics.subtractVec2(objects[j].center, objects[i].center)) < 0) {
                                world.collisionInfo = {
                                    depth: world.collisionInfo.depth,
                                    normal: physics.scale(world.collisionInfo.normal, -1),
                                    start: world.collisionInfo.end,
                                    end: world.collisionInfo.start
                                };
                            }

                            // Resolve collision
                            resolveCollision(objects[i], objects[j], world.collisionInfo);
                        }
                    }
                }
            }
        }
    },

    // 2D vector tools
    Vec2(x: number, y: number): Vector2 {
        return ({ x, y });
    },
    
    lengthVec2(v: Vector2): number {
        return physics.dotProduct(v, v) ** .5;
    },
    
    addVec2(v: Vector2, w: Vector2): Vector2 {
        return physics.Vec2(v.x + w.x, v.y + w.y);
    },
    
    subtractVec2(v: Vector2, w: Vector2): Vector2 {
        return physics.addVec2(v, physics.scale(w, -1));
    },
    
    scale(v: Vector2, n: number): Vector2 {
        return physics.Vec2(v.x * n, v.y * n);
    },
    
    dotProduct(v: Vector2, w: Vector2): number {
        return v.x * w.x + v.y * w.y;
    },
    
    crossProduct(v: Vector2, w: Vector2): number {
        return v.x * w.y - v.y * w.x;
    },
    
    rotateVec2(v: Vector2, center: Vector2, angle: number, x = v.x - center.x, y = v.y - center.y): Vector2 {
        return physics.Vec2(x * Math.cos(angle) - y * Math.sin(angle) + center.x, x * Math.sin(angle) + y * Math.cos(angle) + center.y);
    },
    
    normalize(v: Vector2): Vector2 {
        return physics.scale(v, 1 / (physics.lengthVec2(v) || 1));
    },
}


const EmptyCollision = (): Collision => {
    return {
        depth: 0,
        normal: physics.Vec2(0, 0),
        start: physics.Vec2(0, 0),
        end: physics.Vec2(0, 0),
    }
};

// Collision info setter
function setCollisionInfo(collision: Collision, D: number, N: Vector2, S: Vector2) {
    collision.depth = D; // depth
    collision.normal = N; // normal
    collision.start = S; // start
    collision.end = physics.addVec2(S, physics.scale(N, D)); // end
}

// New shape
function createRigidShape(world: PhysicsWorld, center: Vector2, mass: number, friction: number, restitution: number, type: number, bounds: number, width = 0, height = 0, rotate: boolean = false): Shape {
    const shape: Shape = {
        type: type, // 0 circle / 1 rectangle
        center: center, // center
        friction: friction, // friction
        restitution: restitution, // restitution (bouncing)
        mass: mass ? 1 / mass : 0, // inverseMass (0 if immobile)
        velocity: physics.Vec2(0, 0), // velocity (speed)
        acceleration: mass ? world.gravity : physics.Vec2(0, 0), // acceleration
        angle: 0, // angle
        angularVelocity: 0, // angle velocity
        angularAcceleration: 0, // angle acceleration
        bounds: bounds, // (bounds) radius
        width: width, // width
        height: height, // height
        inertia: type // inertia
            ? (Math.hypot(width, height) / 2, mass > 0 ? 1 / (mass * (width ** 2 + height ** 2) / 12) : (rotate ? 0.01 : 0)) // rectangle
            : (mass > 0 ? (mass * bounds ** 2) / 12 : 0), // circle
        faceNormals: [], // face normals array (rectangles)
        vertices: [ // Vertex: 0: TopLeft, 1: TopRight, 2: BottomRight, 3: BottomLeft (rectangles)
            physics.Vec2(center.x - width / 2, center.y - height / 2),
            physics.Vec2(center.x + width / 2, center.y - height / 2),
            physics.Vec2(center.x + width / 2, center.y + height / 2),
            physics.Vec2(center.x - width / 2, center.y + height / 2)
        ],
        angularDamp: defaultAngularDamp,
        damp: defaultDamp
    };

    // Prepare rectangle
    if (type /* == 1 */) {
        computeRectNormals(shape);
    }
    world.objects.push(shape);
    return shape;
}

// Test if two shapes have intersecting bounding circles
function boundTest(s1: Shape, s2: Shape) {
    return physics.lengthVec2(physics.subtractVec2(s2.center, s1.center)) <= s1.bounds + s2.bounds;
}

// Compute face normals (for rectangles)
function computeRectNormals(shape: Shape): void {

    // N: normal of each face toward outside of rectangle
    // 0: Top, 1: Right, 2: Bottom, 3: Left
    for (let i = 4; i--;) {
        shape.faceNormals[i] = physics.normalize(physics.subtractVec2(shape.vertices[(i + 1) % 4], shape.vertices[(i + 2) % 4]));
    }
}

// Find the axis of least penetration between two rects
function findAxisLeastPenetration(rect: Shape, otherRect: Shape, collisionInfo: Collision) {
    let n,
        i,
        j,
        supportPoint,
        bestDistance = 1e9,
        bestIndex = -1,
        hasSupport = true,
        tmpSupportPoint,
        tmpSupportPointDist;

    for (i = 4; hasSupport && i--;) {

        // Retrieve a face normal from A
        n = rect.faceNormals[i];

        // use -n as direction and the vertex on edge i as point on edge
        const
            dir = physics.scale(n, -1),
            ptOnEdge = rect.vertices[i];
        let
            // find the support on B
            vToEdge,
            projection;
        tmpSupportPointDist = -1e9;
        tmpSupportPoint = -1;

        // check each vector of other object
        for (j = 4; j--;) {
            vToEdge = physics.subtractVec2(otherRect.vertices[j], ptOnEdge);
            projection = physics.dotProduct(vToEdge, dir);

            // find the longest distance with certain edge
            // dir is -n direction, so the distance should be positive     
            if (projection > 0 && projection > tmpSupportPointDist) {
                tmpSupportPoint = otherRect.vertices[j];
                tmpSupportPointDist = projection;
            }
        }
        hasSupport = (tmpSupportPoint !== -1);

        // get the shortest support point depth
        if (hasSupport && tmpSupportPointDist < bestDistance) {
            bestDistance = tmpSupportPointDist;
            bestIndex = i;
            supportPoint = tmpSupportPoint;
        }
    }

    if (hasSupport) {
        // all four directions have support point
        setCollisionInfo(collisionInfo, bestDistance, rect.faceNormals[bestIndex], physics.addVec2(supportPoint as Vector2, physics.scale(rect.faceNormals[bestIndex], bestDistance)));
    }

    return hasSupport;
}

// Test collision between two shapes
function testCollision(world: PhysicsWorld, c1: Shape, c2: Shape, collisionInfo: Collision) {
    // Circle vs circle
    if (!c1.type && !c2.type) {
        const
            vFrom1to2 = physics.subtractVec2(c2.center, c1.center),
            rSum = c1.bounds + c2.bounds,
            dist = physics.lengthVec2(vFrom1to2);

        if (dist <= Math.sqrt(rSum * rSum)) {
            const normalFrom2to1 = physics.normalize(physics.scale(vFrom1to2, -1)),
                radiusC2 = physics.scale(normalFrom2to1, c2.bounds);
            setCollisionInfo(collisionInfo, rSum - dist, physics.normalize(vFrom1to2), physics.addVec2(c2.center, radiusC2));
        }

        return 1;
    }

    // Rect vs Rect
    if (c1.type /*== 1*/ && c2.type /*== 1*/) {
        let status1 = false,
            status2 = false;

        // find Axis of Separation for both rectangles
        status1 = findAxisLeastPenetration(c1, c2, world.collisionInfoR1);
        if (status1) {
            status2 = findAxisLeastPenetration(c2, c1, world.collisionInfoR2);
            if (status2) {

                // if both of rectangles are overlapping, choose the shorter normal as the normal     
                if (world.collisionInfoR1.depth < world.collisionInfoR2.depth) {
                    setCollisionInfo(collisionInfo, world.collisionInfoR1.depth, world.collisionInfoR1.normal, 
                        physics.subtractVec2(world.collisionInfoR1.start, physics.scale(world.collisionInfoR1.normal, world.collisionInfoR1.depth)));
                }

                else {
                    setCollisionInfo(collisionInfo, world.collisionInfoR2.depth, physics.scale(world.collisionInfoR2.normal, -1), world.collisionInfoR2.start);
                }
            }
        }
        return status1 && status2;
    }

    // Rectangle vs Circle
    // (c1 is the rectangle and c2 is the circle, invert the two if needed)
    if (!c1.type && c2.type /*== 1*/) {
        [c1, c2] = [c2, c1];
    }

    if (c1.type /*== 1*/ && !c2.type) {
        let inside = 1,
            bestDistance = -1e9,
            nearestEdge = 0,
            i, v,
            circ2Pos: Vector2 | undefined, projection;
        for (i = 4; i--;) {

            // find the nearest face for center of circle    
            circ2Pos = c2.center;
            v = physics.subtractVec2(circ2Pos, c1.vertices[i]);
            projection = physics.dotProduct(v, c1.faceNormals[i]);
            if (projection > 0) {

                // if the center of circle is outside of c1angle
                bestDistance = projection;
                nearestEdge = i;
                inside = 0;
                break;
            }

            if (projection > bestDistance) {
                bestDistance = projection;
                nearestEdge = i;
            }
        }
        let dis, normal;

        if (inside && circ2Pos) {

            // the center of circle is inside of c1angle
            setCollisionInfo(collisionInfo, c2.bounds - bestDistance, c1.faceNormals[nearestEdge], physics.subtractVec2(circ2Pos, physics.scale(c1.faceNormals[nearestEdge], c2.bounds)));
        }
        else if (circ2Pos) {

            // the center of circle is outside of c1angle
            // v1 is from left vertex of face to center of circle 
            // v2 is from left vertex of face to right vertex of face
            let
                v1 = physics.subtractVec2(circ2Pos, c1.vertices[nearestEdge]),
                v2 = physics.subtractVec2(c1.vertices[(nearestEdge + 1) % 4], c1.vertices[nearestEdge]),
                dotp = physics.dotProduct(v1, v2);
            if (dotp < 0) {

                // the center of circle is in corner region of X[nearestEdge]
                dis = physics.lengthVec2(v1);

                // compare the distance with radium to decide collision
                if (dis > c2.bounds) {
                    return;
                }
                normal = physics.normalize(v1);
                setCollisionInfo(collisionInfo, c2.bounds - dis, normal, physics.addVec2(circ2Pos, physics.scale(normal, -c2.bounds)));
            }
            else {

                // the center of circle is in corner region of X[nearestEdge+1]
                // v1 is from right vertex of face to center of circle 
                // v2 is from right vertex of face to left vertex of face
                v1 = physics.subtractVec2(circ2Pos, c1.vertices[(nearestEdge + 1) % 4]);
                v2 = physics.scale(v2, -1);
                dotp = physics.dotProduct(v1, v2);
                if (dotp < 0) {
                    dis = physics.lengthVec2(v1);

                    // compare the distance with radium to decide collision
                    if (dis > c2.bounds) {
                        return;
                    }
                    normal = physics.normalize(v1);
                    setCollisionInfo(collisionInfo, c2.bounds - dis, normal, physics.addVec2(circ2Pos, physics.scale(normal, -c2.bounds)));
                }

                else {

                    // the center of circle is in face region of face[nearestEdge]
                    if (bestDistance < c2.bounds) {
                        setCollisionInfo(collisionInfo, c2.bounds - bestDistance, c1.faceNormals[nearestEdge], physics.subtractVec2(circ2Pos, physics.scale(c1.faceNormals[nearestEdge], c2.bounds)));
                    }

                    else {
                        return;
                    }
                }
            }
        }
        return 1;
    }
}

function resolveCollision(s1: Shape, s2: Shape, collisionInfo: Collision) {
    if (!s1.mass && !s2.mass) {
        return;
    }

    // correct positions
    const
        num = collisionInfo.depth / (s1.mass + s2.mass) * .8, // .8 = poscorrectionrate = percentage of separation to project objects
        correctionAmount = physics.scale(collisionInfo.normal, num),
        n = collisionInfo.normal;
    
    if (physics.lengthVec2(correctionAmount) === 0) {
        return;
    }
    physics.moveShape(s1, physics.scale(correctionAmount, -s1.mass));
    physics.moveShape(s2, physics.scale(correctionAmount, s2.mass));


    // the direction of collisionInfo is always from s1 to s2
    // but the Mass is inversed, so start scale with s2 and end scale with s1
    const
        start = physics.scale(collisionInfo.start, s2.mass / (s1.mass + s2.mass)),
        end = physics.scale(collisionInfo.end, s1.mass / (s1.mass + s2.mass)),
        p = physics.addVec2(start, end),
        // r is vector from center of object to collision point
        r1 = physics.subtractVec2(p, s1.center),
        r2 = physics.subtractVec2(p, s2.center),

        // newV = V + v cross R
        v1 = physics.addVec2(s1.velocity, physics.Vec2(-1 * s1.angularVelocity * r1.y, s1.angularVelocity * r1.x)),
        v2 = physics.addVec2(s2.velocity, physics.Vec2(-1 * s2.angularVelocity * r2.y, s2.angularVelocity * r2.x)),
        relativeVelocity = physics.subtractVec2(v2, v1),

        // Relative velocity in normal direction
        rVelocityInNormal = physics.dotProduct(relativeVelocity, n);

    // if objects moving apart ignore
    if (rVelocityInNormal > 0) {
        return;
    }

    // compute and apply response impulses for each object  
    const
        newRestituion = Math.min(s1.restitution, s2.restitution),
        newFriction = Math.min(s1.friction, s2.friction),

        // R cross N
        R1crossN = physics.crossProduct(r1, n),
        R2crossN = physics.crossProduct(r2, n),

        // Calc impulse scalar
        // the formula of jN can be found in http://www.myphysicslab.com/collision.html
        jN = (-(1 + newRestituion) * rVelocityInNormal) / (s1.mass + s2.mass + R1crossN * R1crossN * s1.inertia + R2crossN * R2crossN * s2.inertia);
    let
        // impulse is in direction of normal ( from s1 to s2)
        impulse = physics.scale(n, jN);

    // impulse = F dt = m * ?v
    // ?v = impulse / m
    s1.velocity = physics.subtractVec2(s1.velocity, physics.scale(impulse, s1.mass));
    s2.velocity = physics.addVec2(s2.velocity, physics.scale(impulse, s2.mass));
    s1.angularVelocity -= R1crossN * jN * s1.inertia;
    s2.angularVelocity += R2crossN * jN * s2.inertia;
    const
        tangent = physics.scale(physics.normalize(physics.subtractVec2(relativeVelocity, physics.scale(n,physics. dotProduct(relativeVelocity, n)))), -1),
        R1crossT = physics.crossProduct(r1, tangent),
        R2crossT = physics.crossProduct(r2, tangent);
    let
        jT = (-(1 + newRestituion) * physics.dotProduct(relativeVelocity, tangent) * newFriction) / (s1.mass + s2.mass + R1crossT * R1crossT * s1.inertia + R2crossT * R2crossT * s2.inertia);

    // friction should less than force in normal direction
    if (jT > jN) {
        jT = jN;
    }

    // impulse is from s1 to s2 (in opposite direction of velocity)
    impulse = physics.scale(tangent, jT);
    s1.velocity = physics.subtractVec2(s1.velocity, physics.scale(impulse, s1.mass));
    s2.velocity = physics.addVec2(s2.velocity, physics.scale(impulse, s2.mass));
    s1.angularVelocity -= R1crossT * jT * s1.inertia;
    s2.angularVelocity += R2crossT * jT * s2.inertia;

    if (Math.abs(s1.angularVelocity) < s1.angularDamp) {
        s1.angularVelocity = 0;
    }
    if (Math.abs(s2.angularVelocity) < s2.angularDamp) {
        s2.angularVelocity = 0;
    }
    if (physics.lengthVec2(s1.velocity) < s1.damp) {
        s1.velocity.x = 0;
        s1.velocity.y = 0;
    }
    if (physics.lengthVec2(s2.velocity) < s1.damp) {
        s2.velocity.x = 0;
        s2.velocity.y = 0;
    }
}

function createDemoScene(): PhysicsWorld {
    // DEMO
    // ====
    const world = physics.createWorld();

    let r = physics.createRectangle(world, physics.Vec2(500, 200), 400, 20, 0, 1, .5);
    physics.rotateShape(r, 2.8);
    physics.createRectangle(world, physics.Vec2(200, 400), 400, 20, 0, 1, .5);
    physics.createRectangle(world, physics.Vec2(100, 200), 200, 20, 0, 1, .5);
    physics.createRectangle(world, physics.Vec2(10, 360), 20, 100, 0, 1, .5);

    for (let i = 0; i < 30; i++) {
        r = physics.createCircle(world, physics.Vec2(Math.random() * 800, Math.random() * 450 / 2), Math.random() * 20 + 10, Math.random() * 30, Math.random() / 2, Math.random() / 2);
        physics.rotateShape(r, Math.random() * 7);
        r = physics.createRectangle(world, physics.Vec2(Math.random() * 800, Math.random() * 450 / 2), Math.random() * 20 + 10, Math.random() * 20 + 10, Math.random() * 30, Math.random() / 2, Math.random() / 2);
        physics.rotateShape(r, Math.random() * 7);
    }

    return world;
}