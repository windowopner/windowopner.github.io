document.addEventListener("DOMContentLoaded", () => {
    // 6. Accessibility Fallback
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        console.log('Reduced motion preferred. WebGL Ripple effect disabled.');
        return;
    }

    const canvas = document.getElementById('glcanvas');
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Initialize Three.js Renderer
    const renderer = new THREE.WebGLRenderer({ 
        canvas, 
        alpha: true, 
        antialias: false,
        powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // 1. Simulation Setup (Ping-Pong FBO)
    const simRes = 512; // High enough for detail, low enough for 60fps
    const options = {
        width: simRes,
        height: simRes,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType, // Better performance & mobile support than FloatType
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
    };

    let rt1 = new THREE.WebGLRenderTarget(simRes, simRes, options);
    let rt2 = new THREE.WebGLRenderTarget(simRes, simRes, options);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // Scenes for different passes
    const simScene = new THREE.Scene();
    const dropScene = new THREE.Scene();
    const renderScene = new THREE.Scene();

    // 3. GLSL Shaders
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `;

    // --- Drop Shader ---
    // Injects a circular disturbance at the mouse coordinate
    const dropFragmentShader = `
        uniform sampler2D tMap;
        uniform vec2 u_mouse;
        uniform float u_radius;
        uniform float u_strength;
        uniform float u_aspect;
        varying vec2 vUv;

        void main() {
            vec4 info = texture2D(tMap, vUv);
            
            vec2 p = vUv - u_mouse;
            p.x *= u_aspect;
            
            float dist = length(p);
            float drop = max(0.0, 1.0 - dist / u_radius);
            drop = 0.5 - cos(drop * 3.14159) * 0.5; // Smoothstep-like falloff
            
            // Add disturbance to current height
            info.r += drop * u_strength;
            
            gl_FragColor = info;
        }
    `;

    // --- Simulation Shader ---
    // Solves the 2D wave equation (Height field simulation)
    const updateFragmentShader = `
        uniform sampler2D tMap;
        uniform vec2 u_delta;
        uniform float u_damping;
        varying vec2 vUv;

        void main() {
            vec4 info = texture2D(tMap, vUv);
            float h_current = info.r;
            float h_prev = info.g;

            // Sample neighbors
            float h_up = texture2D(tMap, vUv + vec2(0.0, u_delta.y)).r;
            float h_down = texture2D(tMap, vUv + vec2(0.0, -u_delta.y)).r;
            float h_left = texture2D(tMap, vUv + vec2(-u_delta.x, 0.0)).r;
            float h_right = texture2D(tMap, vUv + vec2(u_delta.x, 0.0)).r;

            // Wave equation
            float h_next = (h_up + h_down + h_left + h_right) * 0.5 - h_prev;
            h_next *= u_damping; // Decay over time

            // Store current as new prev (g channel), and next as current (r channel)
            gl_FragColor = vec4(h_next, h_current, 0.0, 1.0);
        }
    `;

    // --- Render Shader ---
    // Converts heightmap to normals and applies specular lighting for water look
    const renderFragmentShader = `
        uniform sampler2D tMap;
        uniform vec2 u_delta;
        varying vec2 vUv;

        void main() {
            float h = texture2D(tMap, vUv).r;

            // Sample neighbors to compute slope/normal
            float h_up = texture2D(tMap, vUv + vec2(0.0, u_delta.y)).r;
            float h_down = texture2D(tMap, vUv + vec2(0.0, -u_delta.y)).r;
            float h_left = texture2D(tMap, vUv + vec2(-u_delta.x, 0.0)).r;
            float h_right = texture2D(tMap, vUv + vec2(u_delta.x, 0.0)).r;

            vec3 dx = vec3(u_delta.x * 300.0, 0.0, h_right - h_left);
            vec3 dy = vec3(0.0, u_delta.y * 300.0, h_up - h_down);
            vec3 normal = normalize(cross(dx, dy));

            // Fake lighting for light background
            vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
            vec3 viewDir = vec3(0.0, 0.0, 1.0);
            vec3 halfVector = normalize(lightDir + viewDir);

            float specular = pow(max(dot(normal, halfVector), 0.0), 100.0);
            float diffuse = max(dot(normal, lightDir), 0.0);

            // Crisp cyan/blue for subtle shadows, sharp white for highlights
            vec3 shadowColor = vec3(0.0, 0.5, 0.9);
            vec3 highlightColor = vec3(1.0, 1.0, 1.0);
            
            float shadowIntensity = (1.0 - diffuse) * 0.6;
            vec3 finalColor = shadowColor * shadowIntensity + highlightColor * specular * 1.5;

            // Calculate transparency (alpha) based on wave steepness
            // On a white background, shadows and speculars define the shape
            float slope = length(vec2(h_right - h_left, h_up - h_down)) * 20.0;
            float alpha = clamp(slope + specular * 2.0 + shadowIntensity * slope, 0.0, 1.0);
            
            // Very subtle depth tint
            float depthAlpha = clamp(abs(h) * 1.5, 0.0, 0.02);

            gl_FragColor = vec4(finalColor, max(alpha, depthAlpha));
        }
    `;

    // Materials
    const dropUniforms = {
        tMap: { value: null },
        u_mouse: { value: new THREE.Vector2() },
        u_radius: { value: 0.015 },
        u_strength: { value: 0.05 },
        u_aspect: { value: width / height }
    };
    const dropMaterial = new THREE.ShaderMaterial({
        uniforms: dropUniforms,
        vertexShader,
        fragmentShader: dropFragmentShader,
        depthWrite: false
    });
    const dropMesh = new THREE.Mesh(geometry, dropMaterial);
    dropScene.add(dropMesh);

    const updateUniforms = {
        tMap: { value: null },
        u_delta: { value: new THREE.Vector2(1.0 / simRes, 1.0 / simRes) },
        u_damping: { value: 0.98 } // Adjust for wave decay speed
    };
    const updateMaterial = new THREE.ShaderMaterial({
        uniforms: updateUniforms,
        vertexShader,
        fragmentShader: updateFragmentShader,
        depthWrite: false
    });
    const updateMesh = new THREE.Mesh(geometry, updateMaterial);
    simScene.add(updateMesh);

    const renderUniforms = {
        tMap: { value: null },
        u_delta: { value: new THREE.Vector2(1.0 / simRes, 1.0 / simRes) }
    };
    const renderMaterial = new THREE.ShaderMaterial({
        uniforms: renderUniforms,
        vertexShader,
        fragmentShader: renderFragmentShader,
        transparent: true,
        depthWrite: false
    });
    const renderMesh = new THREE.Mesh(geometry, renderMaterial);
    renderScene.add(renderMesh);

    // 4. Cursor Interaction System
    const mouse = new THREE.Vector2();
    const prevMouse = new THREE.Vector2();
    let isMouseMoving = false;
    let firstMove = true;

    window.addEventListener('pointermove', (e) => {
        mouse.x = e.clientX / width;
        mouse.y = 1.0 - (e.clientY / height);
        
        if (firstMove) {
            prevMouse.copy(mouse);
            firstMove = false;
        }
        isMouseMoving = true;
    }, { passive: true });

    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setSize(width, height);
        dropUniforms.u_aspect.value = width / height;
    }, { passive: true });

    function applyDrop(x, y, radius, strength) {
        dropUniforms.u_mouse.value.set(x, y);
        dropUniforms.u_radius.value = radius;
        dropUniforms.u_strength.value = strength;
        dropUniforms.tMap.value = rt1.texture;
        
        renderer.setRenderTarget(rt2);
        renderer.render(dropScene, camera);
        
        // Swap FBOs
        let temp = rt1;
        rt1 = rt2;
        rt2 = temp;
    }

    // 5. Performance Optimization: RequestAnimationFrame Loop
    function animate() {
        requestAnimationFrame(animate);

        // Interpolate mouse movement to draw continuous trail
        if (isMouseMoving) {
            const dist = prevMouse.distanceTo(mouse);
            if (dist > 0.005) { // Minimum distance threshold
                const steps = Math.min(Math.ceil(dist / 0.005), 20); // Cap steps to prevent lag spikes
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const x = THREE.MathUtils.lerp(prevMouse.x, mouse.x, t);
                    const y = THREE.MathUtils.lerp(prevMouse.y, mouse.y, t);
                    applyDrop(x, y, 0.015, 0.1);
                }
                prevMouse.copy(mouse);
            }
        }

        // Simulate Wave Physics
        updateUniforms.tMap.value = rt1.texture;
        renderer.setRenderTarget(rt2);
        renderer.render(simScene, camera);
        
        // Swap FBOs
        let temp = rt1;
        rt1 = rt2;
        rt2 = temp;

        // Render to Screen Canvas
        renderUniforms.tMap.value = rt1.texture;
        renderer.setRenderTarget(null); // null = canvas
        renderer.render(renderScene, camera);
    }

    // Start simulation
    animate();
});
