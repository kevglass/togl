
// MINI 2D PHYSICS
// ===============
// Port of https://github.com/xem/mini2Dphysics/tree/gh-pages

export namespace physics {
    export enum ShapeType {
        CIRCLE = 0,
        RECTANGLE = 1,
    }
    export interface Vector2 {
        x: number;
        y: number;
    }

    export interface Joint {
        bodyA: number;
        bodyB: number;
        distance: number;
        rigidity: number;
        elasticity: number;
    }

    export interface Collision {
        depth: number;
        normal: Vector2;
        start: Vector2;
        end: Vector2;
    }

    export interface Body {
        id: number;
        type: number,
        center: Vector2,
        averageCenter: Vector2;
        friction: number,
        restitution: number,
        mass: number,
        velocity: Vector2,
        acceleration: Vector2,
        angle: number,
        averageAngle: number;
        angularVelocity: number,
        angularAcceleration: number,
        bounds: number,
        width: number,
        height: number,
        inertia: number,
        faceNormals: Vector2[]
        vertices: Vector2[],
        pinned: boolean;
        restingTime: number;
        data: any;
    }

    export interface PhysicsWorld {
        bodies: Body[];
        gravity: Vector2;
        collisionInfo: Collision;
        collisionInfoR1: Collision;
        collisionInfoR2: Collision;
        angularDamp: number;
        damp: number;
        nextId: number;
        joints: Joint[];
    }

    export function getWorldBounds(world: PhysicsWorld): { min: Vector2, max: Vector2 } {
        if (!world.bodies) {
            return {
                min: newVec2(0, 0),
                max: newVec2(0, 0)
            };
        }

        const body: Body = world.bodies[0];
        let min = newVec2(body.center.x - body.bounds, body.center.y - body.bounds);
        let max = newVec2(body.center.x + body.bounds, body.center.y + body.bounds);

        for (const body of world.bodies) {
            if (body.type === ShapeType.CIRCLE) {
                min.x = Math.min(min.x, body.center.x - body.bounds);
                min.y = Math.min(min.y, body.center.y - body.bounds);
                max.x = Math.max(max.x, body.center.x + body.bounds);
                max.y = Math.max(max.y, body.center.y + body.bounds);
            } else if (body.type === ShapeType.RECTANGLE) {
                for (const vert of body.vertices) {
                    min.x = Math.min(min.x, vert.x);
                    min.y = Math.min(min.y, vert.y);
                    max.x = Math.max(max.x, vert.x);
                    max.y = Math.max(max.y, vert.y;
                }
            }
        }

        return { min, max };
    }

    export function createWorld(): PhysicsWorld {
        return {
            bodies: [],
            gravity: newVec2(0, 100),
            collisionInfo: EmptyCollision(),
            collisionInfoR1: EmptyCollision(),
            collisionInfoR2: EmptyCollision(),
            angularDamp: 0.98,
            damp: 0.98,
            nextId: 1,
            joints: []
        }
    };

    export function createJoint(world: PhysicsWorld, bodyA: Body, bodyB: Body, rigidity: number = 1, elasticity: number = 0): void {
        world.joints.push({
            bodyA: bodyA.id,
            bodyB: bodyB.id,
            distance: lengthVec2(subtractVec2(bodyA.center, bodyB.center)) + 0.5, // add a bit of space to prevent constant collision
            rigidity,
            elasticity
        });
    };

    export function allowPinnedRotation(body: Body, mass: number): void {
        body.mass = mass;
        body.inertia = calculateInertia(body.type, body.mass, body.bounds, body.width, body.height)
        body.pinned = true;
    };

    // New circle
    export function createCircle(world: PhysicsWorld, center: Vector2, radius: number, mass: number, friction: number, restitution: number): Body {
        // the original code only works well with whole number static objects
        center.x = Math.floor(center.x);
        center.y = Math.floor(center.y);
        radius = Math.floor(radius);

        return createRigidShape(world, center, mass, friction, restitution, 0, radius);
    };

    // New rectangle
    export function createRectangle(world: PhysicsWorld, center: Vector2, width: number, height: number, mass: number, friction: number, restitution: number): Body {
        // the original code only works well with whole number static objects
        center.x = Math.floor(center.x);
        center.y = Math.floor(center.y);
        width = Math.floor(width);
        height = Math.floor(height);

        return createRigidShape(world, center, mass, friction, restitution, 1, Math.hypot(width, height) / 2, width, height);
    };

    // Move a shape along a vector
    export function moveShape(shape: Body, v: Vector2) {
        if (shape.pinned) {
            return;
        }
        // Center
        shape.center = addVec2(shape.center, v);

        // Rectangle (move vertex)
        if (shape.type) {
            for (let i = 4; i--;) {
                shape.vertices[i] = addVec2(shape.vertices[i], v);
            }
        }
    };

    // Rotate a shape around its center
    export function rotateShape(shape: Body, angle: number) {
        // Update angle
        shape.angle += angle;

        // Rectangle (rotate vertex)
        if (shape.type) {
            for (let i = 4; i--;) {
                shape.vertices[i] = rotateVec2(shape.vertices[i], shape.center, angle);
            }
            computeRectNormals(shape);
        }
    };

    export function worldStep(fps: number, world: PhysicsWorld) {
        for (const body of world.bodies) {
            // Update position/rotation
            if (body.mass !== 0) {
                body.velocity = addVec2(body.velocity, scaleVec2(body.acceleration, 1 / fps));
                moveShape(body, scaleVec2(body.velocity, 1 / fps));
                body.angularVelocity += body.angularAcceleration * 1 / fps;
                rotateShape(body, body.angularVelocity * 1 / fps);
            }
        }

        // apply velocity to try and maintain joints
        for (const body of world.bodies) {
            if (body.mass === 0) {
                continue;
            }

            const joints = world.joints.filter(j => j.bodyA === body.id || j.bodyB === body.id);
            for (const joint of joints) {
                const otherId = joint.bodyA === body.id ? joint.bodyB : joint.bodyA;
                const other = world.bodies.find(b => b.id === otherId);
                if (other) {
                    let vec = subtractVec2(other.center, body.center)
                    const distance = lengthVec2(vec);
                    const diff = distance - joint.distance;
                    if (diff != 0) {
                        if (diff > 0) {
                            vec = scaleVec2(vec, (1 / distance) * diff * (1 - joint.elasticity) * (other.mass === 0 ? 1 : 0.5));
                        } else {
                            vec = scaleVec2(vec, (1 / distance) * diff * joint.rigidity * (other.mass === 0 ? 1 : 0.5));
                        }
                        moveShape(body, vec);
                        body.velocity = addVec2(body.velocity, scaleVec2(vec, fps));
                    }
                }
            }
        }


        const bodies = world.bodies;

        // Compute collisions and iterate to resolve
        for (let k = 9; k--;) {
            let collision = false;

            for (let i = bodies.length; i--;) {
                for (let j = bodies.length; j-- > i;) {
                    if (i === j) {
                        continue;
                    }
                    // don't collide two static objects
                    if ((bodies[i].mass === 0) && (bodies[j].mass === 0)) {
                        continue;
                    }
                    // Test bounds
                    if (boundTest(bodies[i], bodies[j])) {

                        // Test collision
                        if (testCollision(world, bodies[i], bodies[j], world.collisionInfo)) {

                            // Make sure the normal is always from object[i] to object[j]
                            if (dotProduct(world.collisionInfo.normal, subtractVec2(bodies[j].center, bodies[i].center)) < 0) {
                                world.collisionInfo = {
                                    depth: world.collisionInfo.depth,
                                    normal: scaleVec2(world.collisionInfo.normal, -1),
                                    start: world.collisionInfo.end,
                                    end: world.collisionInfo.start
                                };
                            }

                            // Resolve collision
                            if (resolveCollision(world, bodies[i], bodies[j], world.collisionInfo)) {
                                collision = true;
                            }
                        }
                    }
                }
            }

            // no more collisions occurred, break out
            if (!collision) {
                break;
            }
        }

        for (const body of world.bodies) {
            if (body.mass > 0) {
                body.restingTime += 1 / fps;

                if (Math.abs(body.center.x - body.averageCenter.x) > 1) {
                    body.averageCenter.x = body.center.x;
                    body.restingTime = 0;
                }
                if (Math.abs(body.center.y - body.averageCenter.y) > 1) {
                    body.averageCenter.y = body.center.y;
                    body.restingTime = 0;
                }
                if (Math.abs(body.angle - body.averageAngle) >= 0.1) {
                    body.averageAngle = body.angle;
                    body.restingTime = 0;
                }
            }
        }
    };

    // 2D vector tools
    export function newVec2(x: number, y: number): Vector2 {
        return ({ x, y });
    };

    export function lengthVec2(v: Vector2): number {
        return dotProduct(v, v) ** .5;
    }

    export function addVec2(v: Vector2, w: Vector2): Vector2 {
        return newVec2(v.x + w.x, v.y + w.y);
    }

    export function subtractVec2(v: Vector2, w: Vector2): Vector2 {
        return addVec2(v, scaleVec2(w, -1));
    }

    export function scaleVec2(v: Vector2, n: number): Vector2 {
        return newVec2(v.x * n, v.y * n);
    }

    export function dotProduct(v: Vector2, w: Vector2): number {
        return v.x * w.x + v.y * w.y;
    }

    export function crossProduct(v: Vector2, w: Vector2): number {
        return v.x * w.y - v.y * w.x;
    }

    export function rotateVec2(v: Vector2, center: Vector2, angle: number, x = v.x - center.x, y = v.y - center.y): Vector2 {
        return newVec2(x * Math.cos(angle) - y * Math.sin(angle) + center.x, x * Math.sin(angle) + y * Math.cos(angle) + center.y);
    }

    export function normalize(v: Vector2): Vector2 {
        return scaleVec2(v, 1 / (lengthVec2(v) || 1));
    }


    const EmptyCollision = (): Collision => {
        return {
            depth: 0,
            normal: newVec2(0, 0),
            start: newVec2(0, 0),
            end: newVec2(0, 0),
        }
    };

    // Collision info setter
    function setCollisionInfo(collision: Collision, D: number, N: Vector2, S: Vector2) {
        collision.depth = D; // depth
        collision.normal.x = N.x; // normal
        collision.normal.y = N.y; // normal
        collision.start.x = S.x; // start
        collision.start.y = S.y; // start
        collision.end = addVec2(S, scaleVec2(N, D)); // end
    }

    function calculateInertia(type: ShapeType, mass: number, bounds: number, width: number, height: number): number {
        return type === ShapeType.RECTANGLE // inertia
            ? (Math.hypot(width, height) / 2, mass > 0 ? 1 / (mass * (width ** 2 + height ** 2) / 12) : 0) // rectangle
            : (mass > 0 ? (mass * bounds ** 2) / 12 : 0); // circle;
    }

    // New shape
    function createRigidShape(world: PhysicsWorld, center: Vector2, mass: number, friction: number, restitution: number, type: number, bounds: number, width = 0, height = 0): Body {
        const shape: Body = {
            id: world.nextId++,
            type: type, // 0 circle / 1 rectangle
            center: center, // center
            averageCenter: newVec2(center.x, center.y),
            friction: friction, // friction
            restitution: restitution, // restitution (bouncing)
            mass: mass ? 1 / mass : 0, // inverseMass (0 if immobile)
            velocity: newVec2(0, 0), // velocity (speed)
            acceleration: mass ? world.gravity : newVec2(0, 0), // acceleration
            angle: 0, // angle
            averageAngle: 0,
            angularVelocity: 0, // angle velocity
            angularAcceleration: 0, // angle acceleration
            bounds: bounds, // (bounds) radius
            width: width, // width
            height: height, // height
            inertia: calculateInertia(type, mass, bounds, width, height),
            faceNormals: [], // face normals array (rectangles)
            vertices: [ // Vertex: 0: TopLeft, 1: TopRight, 2: BottomRight, 3: BottomLeft (rectangles)
                newVec2(center.x - width / 2, center.y - height / 2),
                newVec2(center.x + width / 2, center.y - height / 2),
                newVec2(center.x + width / 2, center.y + height / 2),
                newVec2(center.x - width / 2, center.y + height / 2)
            ],
            pinned: false,
            restingTime: 0,
            data: null
        };

        // Prepare rectangle
        if (type /* == 1 */) {
            computeRectNormals(shape);
        }
        world.bodies.push(shape);
        return shape;
    }

    // Test if two shapes have intersecting bounding circles
    function boundTest(s1: Body, s2: Body) {
        return lengthVec2(subtractVec2(s2.center, s1.center)) <= s1.bounds + s2.bounds;
    }

    // Compute face normals (for rectangles)
    function computeRectNormals(shape: Body): void {

        // N: normal of each face toward outside of rectangle
        // 0: Top, 1: Right, 2: Bottom, 3: Left
        for (let i = 4; i--;) {
            shape.faceNormals[i] = normalize(subtractVec2(shape.vertices[(i + 1) % 4], shape.vertices[(i + 2) % 4]));
        }
    }

    // Find the axis of least penetration between two rects
    function findAxisLeastPenetration(rect: Body, otherRect: Body, collisionInfo: Collision) {
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
                dir = scaleVec2(n, -1),
                ptOnEdge = rect.vertices[i];
            let
                // find the support on B
                vToEdge,
                projection;
            tmpSupportPointDist = -1e9;
            tmpSupportPoint = -1;

            // check each vector of other object
            for (j = 4; j--;) {
                vToEdge = subtractVec2(otherRect.vertices[j], ptOnEdge);
                projection = dotProduct(vToEdge, dir);

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
            setCollisionInfo(collisionInfo, bestDistance, rect.faceNormals[bestIndex], addVec2(supportPoint as Vector2, scaleVec2(rect.faceNormals[bestIndex], bestDistance)));
        }

        return hasSupport;
    }

    // Test collision between two shapes
    function testCollision(world: PhysicsWorld, c1: Body, c2: Body, collisionInfo: Collision): boolean {
        // static bodies don't collide with each other
        if ((c1.mass === 0 && c2.mass === 0)) {
            return false;
        }

        // Circle vs circle
        if (c1.type == ShapeType.CIRCLE && c2.type === ShapeType.CIRCLE) {
            const
                vFrom1to2 = subtractVec2(c2.center, c1.center),
                rSum = c1.bounds + c2.bounds,
                dist = lengthVec2(vFrom1to2);

            if (dist <= Math.sqrt(rSum * rSum)) {
                const normalFrom2to1 = normalize(scaleVec2(vFrom1to2, -1)),
                    radiusC2 = scaleVec2(normalFrom2to1, c2.bounds);
                setCollisionInfo(collisionInfo, rSum - dist, normalize(vFrom1to2), addVec2(c2.center, radiusC2));

                return true;
            }

            return false;
        }

        // Rect vs Rect
        if (c1.type == ShapeType.RECTANGLE && c2.type == ShapeType.RECTANGLE) {
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
                            subtractVec2(world.collisionInfoR1.start, scaleVec2(world.collisionInfoR1.normal, world.collisionInfoR1.depth)));
                        return true;
                    }
                    else {
                        setCollisionInfo(collisionInfo, world.collisionInfoR2.depth, scaleVec2(world.collisionInfoR2.normal, -1), world.collisionInfoR2.start);
                        return true;
                    }
                }
            }

            return false;
        }

        // Rectangle vs Circle
        // (c1 is the rectangle and c2 is the circle, invert the two if needed)
        if (c1.type === ShapeType.CIRCLE && c2.type === ShapeType.RECTANGLE) {
            [c1, c2] = [c2, c1];
        }

        if (c1.type === ShapeType.RECTANGLE && c2.type === ShapeType.CIRCLE) {
            let inside = 1,
                bestDistance = -1e9,
                nearestEdge = 0,
                i, v,
                circ2Pos: Vector2 | undefined, projection;
            for (i = 4; i--;) {

                // find the nearest face for center of circle    
                circ2Pos = c2.center;
                v = subtractVec2(circ2Pos, c1.vertices[i]);
                projection = dotProduct(v, c1.faceNormals[i]);
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
                setCollisionInfo(collisionInfo, c2.bounds - bestDistance, c1.faceNormals[nearestEdge], subtractVec2(circ2Pos, scaleVec2(c1.faceNormals[nearestEdge], c2.bounds)));
                return true;
            }
            else if (circ2Pos) {

                // the center of circle is outside of c1angle
                // v1 is from left vertex of face to center of circle 
                // v2 is from left vertex of face to right vertex of face
                let
                    v1 = subtractVec2(circ2Pos, c1.vertices[nearestEdge]),
                    v2 = subtractVec2(c1.vertices[(nearestEdge + 1) % 4], c1.vertices[nearestEdge]),
                    dotp = dotProduct(v1, v2);
                if (dotp < 0) {

                    // the center of circle is in corner region of X[nearestEdge]
                    dis = lengthVec2(v1);

                    // compare the distance with radium to decide collision
                    if (dis > c2.bounds) {
                        return false;
                    }
                    normal = normalize(v1);
                    setCollisionInfo(collisionInfo, c2.bounds - dis, normal, addVec2(circ2Pos, scaleVec2(normal, -c2.bounds)));
                    return true;
                }
                else {

                    // the center of circle is in corner region of X[nearestEdge+1]
                    // v1 is from right vertex of face to center of circle 
                    // v2 is from right vertex of face to left vertex of face
                    v1 = subtractVec2(circ2Pos, c1.vertices[(nearestEdge + 1) % 4]);
                    v2 = scaleVec2(v2, -1);
                    dotp = dotProduct(v1, v2);
                    if (dotp < 0) {
                        dis = lengthVec2(v1);

                        // compare the distance with radium to decide collision
                        if (dis > c2.bounds) {
                            return false;
                        }
                        normal = normalize(v1);
                        setCollisionInfo(collisionInfo, c2.bounds - dis, normal, addVec2(circ2Pos, scaleVec2(normal, -c2.bounds)));
                        return true;
                    } else {

                        // the center of circle is in face region of face[nearestEdge]
                        if (bestDistance < c2.bounds) {
                            setCollisionInfo(collisionInfo, c2.bounds - bestDistance, c1.faceNormals[nearestEdge], subtractVec2(circ2Pos, scaleVec2(c1.faceNormals[nearestEdge], c2.bounds)));
                            return true;
                        } else {
                            return false;
                        }
                    }
                }
            }
            return false;
        }

        return false;
    }

    function resolveCollision(world: PhysicsWorld, s1: Body, s2: Body, collisionInfo: Collision): boolean {
        if (!s1.mass && !s2.mass) {
            return false;
        }

        // correct positions
        const
            num = collisionInfo.depth / (s1.mass + s2.mass) * .8, // .8 = poscorrectionrate = percentage of separation to project objects
            correctionAmount = scaleVec2(collisionInfo.normal, num),
            n = collisionInfo.normal;

        if (lengthVec2(correctionAmount) === 0) {
            return false;
        }

        moveShape(s1, scaleVec2(correctionAmount, -s1.mass));
        moveShape(s2, scaleVec2(correctionAmount, s2.mass));

        // the direction of collisionInfo is always from s1 to s2
        // but the Mass is inversed, so start scale with s2 and end scale with s1
        const
            start = scaleVec2(collisionInfo.start, s2.mass / (s1.mass + s2.mass)),
            end = scaleVec2(collisionInfo.end, s1.mass / (s1.mass + s2.mass)),
            p = addVec2(start, end),
            // r is vector from center of object to collision point
            r1 = subtractVec2(p, s1.center),
            r2 = subtractVec2(p, s2.center),

            // newV = V + v cross R
            v1 = addVec2(s1.velocity, newVec2(-1 * s1.angularVelocity * r1.y, s1.angularVelocity * r1.x)),
            v2 = addVec2(s2.velocity, newVec2(-1 * s2.angularVelocity * r2.y, s2.angularVelocity * r2.x)),
            relativeVelocity = subtractVec2(v2, v1),

            // Relative velocity in normal direction
            rVelocityInNormal = dotProduct(relativeVelocity, n);

        // if objects moving apart ignore
        if (rVelocityInNormal > 0) {
            return false;
        }

        // compute and apply response impulses for each object  
        const
            newRestituion = Math.min(s1.restitution, s2.restitution),
            newFriction = Math.min(s1.friction, s2.friction),

            // R cross N
            R1crossN = crossProduct(r1, n),
            R2crossN = crossProduct(r2, n),

            // Calc impulse scalar
            // the formula of jN can be found in http://www.myphysicslab.com/collision.html
            jN = (-(1 + newRestituion) * rVelocityInNormal) / (s1.mass + s2.mass + R1crossN * R1crossN * s1.inertia + R2crossN * R2crossN * s2.inertia);
        let
            // impulse is in direction of normal ( from s1 to s2)
            impulse = scaleVec2(n, jN);

        // impulse = F dt = m * ?v
        // ?v = impulse / m
        s1.velocity = subtractVec2(s1.velocity, scaleVec2(impulse, s1.mass));
        s2.velocity = addVec2(s2.velocity, scaleVec2(impulse, s2.mass));
        s1.angularVelocity -= R1crossN * jN * s1.inertia;
        s2.angularVelocity += R2crossN * jN * s2.inertia;
        const
            tangent = scaleVec2(normalize(subtractVec2(relativeVelocity, scaleVec2(n, dotProduct(relativeVelocity, n)))), -1),
            R1crossT = crossProduct(r1, tangent),
            R2crossT = crossProduct(r2, tangent);
        let
            jT = (-(1 + newRestituion) * dotProduct(relativeVelocity, tangent) * newFriction) / (s1.mass + s2.mass + R1crossT * R1crossT * s1.inertia + R2crossT * R2crossT * s2.inertia);

        // friction should less than force in normal direction
        if (jT > jN) {
            jT = jN;
        }

        // impulse is from s1 to s2 (in opposite direction of velocity)
        impulse = scaleVec2(tangent, jT);
        s1.velocity = subtractVec2(s1.velocity, scaleVec2(impulse, s1.mass));
        s2.velocity = addVec2(s2.velocity, scaleVec2(impulse, s2.mass));
        s1.angularVelocity -= R1crossT * jT * s1.inertia;
        s2.angularVelocity += R2crossT * jT * s2.inertia;

        s1.velocity.x *= world.damp;
        s1.velocity.y *= world.damp;
        s2.velocity.x *= world.damp;
        s2.velocity.y *= world.damp;
        s1.angularVelocity *= world.angularDamp;
        s2.angularVelocity *= world.angularDamp;

        if (s1.pinned) {
            s1.velocity.x = 0;
            s1.velocity.y = 0;
        }
        if (s2.pinned) {
            s2.velocity.x = 0;
            s2.velocity.y = 0;
        }
        return true;
    }

    export function createDemoScene(count: number, withBoxes: boolean): PhysicsWorld {
        // DEMO
        // ====
        const world = createWorld();

        let r = createRectangle(world, newVec2(500, 200), 400, 20, 0, 1, .5);
        rotateShape(r, 2.8);
        createRectangle(world, newVec2(200, 400), 400, 20, 0, 1, .5);
        createRectangle(world, newVec2(100, 200), 200, 20, 0, 1, .5);
        createRectangle(world, newVec2(10, 360), 20, 100, 0, 1, .5);

        for (let i = 0; i < count; i++) {
            r = createCircle(world, newVec2(Math.random() * 800, Math.random() * 450 / 2), Math.random() * 20 + 10, Math.random() * 30, Math.random() / 2, Math.random() / 2);
            rotateShape(r, Math.random() * 7);
            if (withBoxes) {
                r = createRectangle(world, newVec2(Math.random() * 800, Math.random() * 450 / 2), Math.random() * 20 + 10, Math.random() * 20 + 10, Math.random() * 30, Math.random() / 2, Math.random() / 2);
                rotateShape(r, Math.random() * 7);
            }
        }

        return world;
    }
}