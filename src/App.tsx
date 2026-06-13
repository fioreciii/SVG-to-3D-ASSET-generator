import React, { useState, useRef, useEffect, useMemo, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Center, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { PRESETS } from './icons';
import { parseSVG } from './utils/svg';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

type MaterialType = 'chrome' | 'gunmetal' | 'porcelain' | 'copper';
type MotionType = 'turntable' | 'sway' | 'pendulum';

const MATERIALS: Record<MaterialType, any> = {
  chrome: { color: '#ffffff', metalness: 1, roughness: 0 },
  gunmetal: { color: '#222222', metalness: 0.8, roughness: 0.2 },
  porcelain: { color: '#ffffff', metalness: 0, roughness: 0.3 },
  copper: { color: '#b87333', metalness: 1, roughness: 0.1 },
};

const SVGObject = React.forwardRef(({ svgString, depth, bevel, materialType, motionType, renderStep, isBaking, onFrameRendered }: any, ref) => {
  const { shapes, maxDim } = useMemo(() => {
    const rawShapes = parseSVG(svgString);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Calculate bounding box by sampling points
    rawShapes.forEach(shape => {
      const points = shape.getPoints();
      points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    let dim = Math.max(width, height);
    if (!dim || dim === -Infinity) dim = 24; // fallback

    return { shapes: rawShapes, maxDim: dim };
  }, [svgString]);

  const groupRef = useRef<THREE.Group>(null);
  const lastRenderedStep = useRef<number | null>(null);
  const matProps = MATERIALS[materialType as MaterialType] || MATERIALS.chrome;
  const { gl } = useThree();

  // Scale depth and bevel relative to the maxDim so that sliders 0.05 means "5% of the object size"
  const scaledDepth = depth * maxDim;
  const scaledBevel = bevel * maxDim;

  useFrame((state) => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    g.rotation.set(0, 0, 0);
    g.position.set(0, 0, 0);

    let t = 0;

    if (isBaking) {
      if (renderStep !== null) {
        t = renderStep;
      }
    } else {
      const elapsed = state.clock.elapsedTime;
      t = (elapsed % 2) / 2;
    }

    if (motionType === 'turntable') {
      g.rotation.y = t * Math.PI * 2;
    } else if (motionType === 'sway') {
      g.rotation.y = Math.sin(t * Math.PI * 2) * 0.5;
    } else if (motionType === 'pendulum') {
      g.rotation.z = Math.sin(t * Math.PI * 2) * 0.5;
    }

    if (isBaking && renderStep !== null) {
      if (lastRenderedStep.current !== renderStep) {
        lastRenderedStep.current = renderStep;
        // Force a render so it's ready on the canvas buffer
        gl.render(state.scene, state.camera);
        onFrameRendered(gl.domElement.toDataURL('image/png'));
      }
    } else {
      lastRenderedStep.current = null;
    }
  });

  useImperativeHandle(ref, () => ({
    exportGLB: () => {
      if (!groupRef.current) return;
      const exporter = new GLTFExporter();
      exporter.parse(
        groupRef.current,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = url;
          link.download = `fioreciii-${materialType}.glb`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },
        (error) => {
          console.error('An error happened', error);
        },
        { binary: true }
      );
    }
  }));

  const objScale = 2.5 / Math.max(maxDim, 1);

  return (
    <group ref={groupRef}>
      <Center>
        <group scale={[objScale, -objScale, objScale]}>
          {shapes.map((shape, i) => (
            <mesh key={i} castShadow receiveShadow>
              <extrudeGeometry args={[shape, { depth: scaledDepth, bevelEnabled: scaledBevel > 0, bevelThickness: scaledBevel, bevelSize: scaledBevel, bevelSegments: 16, curveSegments: 256 }]} />
              <meshStandardMaterial {...matProps} />
            </mesh>
          ))}
        </group>
      </Center>
    </group>
  );
});

const ControlGroup = ({ title, children }: any) => (
  <div className="mb-6">
    <div className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">{title}</div>
    {children}
  </div>
);

const TagButton = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={`text-xs px-2 py-1 mr-1 mb-1 border rounded-sm transition-colors ${
      active ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-transparent text-zinc-600 border-zinc-200 hover:border-zinc-300'
    }`}
  >
    {children}
  </button>
);

export default function App() {
  const [subject, setSubject] = useState<string>('github');
  const [customSvg, setCustomSvg] = useState<string | null>(null);
  const [material, setMaterial] = useState<MaterialType>('chrome');
  const [depth, setDepth] = useState<number>(0.05);
  const [bevel, setBevel] = useState<number>(0.05);
  const [motion, setMotion] = useState<MotionType>('turntable');
  
  const [frames, setFrames] = useState<number>(48);
  const [frameSize, setFrameSize] = useState<number>(256);

  const [spriteSheet, setSpriteSheet] = useState<string | null>(null);
  
  // Baking logic
  const [isBaking, setIsBaking] = useState(false);
  const [renderStep, setRenderStep] = useState<number | null>(null);
  const [bakedFrames, setBakedFrames] = useState<string[]>([]);
  const bakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const svgObjectRef = useRef<any>(null);

  const startBake = () => {
    setIsBaking(true);
    setSpriteSheet(null);
    setBakedFrames([]);
    setRenderStep(0);
  };

  const handleFrameRendered = (dataUrl: string) => {
    if (!isBaking) return;
    setBakedFrames((prev) => {
      const next = [...prev, dataUrl];
      if (next.length === frames) {
        setIsBaking(false);
        setRenderStep(null);
        assembleSpriteSheet(next);
      } else {
        setRenderStep(next.length / frames);
      }
      return next;
    });
  };

  const assembleSpriteSheet = (imagesData: string[]) => {
    const canvas = bakeCanvasRef.current;
    if (!canvas) return;
    canvas.width = frames * frameSize;
    canvas.height = frameSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let loaded = 0;
    imagesData.forEach((src, i) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(i * frameSize, 0, frameSize, frameSize);
        // source canvas might be window size, we need to draw it scaled to frameSize
        const scale = Math.min(frameSize / img.width, frameSize / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = i * frameSize + (frameSize - w) / 2;
        const y = (frameSize - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        loaded++;
        if (loaded === frames) {
          setSpriteSheet(canvas.toDataURL('image/png'));
        }
      };
      img.src = src;
    });
  };

  const randomize = () => {
    const subjects = Object.keys(PRESETS);
    setSubject(subjects[Math.floor(Math.random() * subjects.length)]);
    setCustomSvg(null);
    
    const materials: MaterialType[] = ['chrome', 'gunmetal', 'porcelain', 'copper'];
    setMaterial(materials[Math.floor(Math.random() * materials.length)]);
    
    setDepth(Number((Math.random() * 0.9 + 0.05).toFixed(2)));
    setBevel(Number((Math.random() * 0.15).toFixed(2)));
    
    const motions: MotionType[] = ['turntable', 'sway', 'pendulum'];
    setMotion(motions[Math.floor(Math.random() * motions.length)]);
  };

  const activeSvg = customSvg || PRESETS[subject] || PRESETS.github;

  return (
    <div className="flex h-screen bg-[#fafafa] text-zinc-900 font-mono text-xs">
      <canvas ref={bakeCanvasRef} style={{ display: 'none' }} />
      <div className="flex-1 flex flex-col p-4 relative h-full overflow-hidden">
        <div className="text-zinc-500 mb-3 whitespace-pre leading-relaxed tracking-tight">
          <span className="font-bold text-zinc-800 text-sm">fioreciii</span><br/>
          {'Stage an object, give it a material and a motion, and bake it to a strip\nof frames - every moving part on this site was printed here.'}
        </div>
        
        {/* Main Viewport */}
        <div className="flex-1 rounded-sm border border-zinc-200 checkerboard relative">
           {isBaking && (
             <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm">
               <div className="bg-black text-white px-4 py-2 rounded-sm shadow-xl">
                 Baking {bakedFrames.length} / {frames}
               </div>
             </div>
           )}
           <Canvas gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}>
              <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={40} />
              <ambientLight intensity={1} />
              <directionalLight position={[5, 5, 5]} intensity={2} castShadow />
              <Environment preset="city" />
              <SVGObject 
                ref={svgObjectRef}
                svgString={activeSvg} 
                depth={depth} 
                bevel={bevel} 
                materialType={material}
                motionType={motion}
                isBaking={isBaking}
                renderStep={renderStep}
                onFrameRendered={handleFrameRendered}
              />
           </Canvas>
        </div>

        {/* Sprite Sheet Preview */}
        {spriteSheet && (
          <div className="mt-2">
            <div className="h-24 border border-zinc-200 rounded-sm mb-2 overflow-x-auto checkerboard cursor-pointer hover:border-zinc-400 transition-colors"
                 onClick={() => {
                    const a = document.createElement('a');
                    a.href = spriteSheet;
                    a.download = `fioreciii-${subject}-${material}-${frames}.png`;
                    a.click();
                 }}>
              <img src={spriteSheet} alt="Sprite Sheet" className="h-full object-contain" />
            </div>
            <div className="text-zinc-400 text-[10px] mt-1 text-center">
              preview • {frames} frames • {frameSize}px
            </div>
          </div>
        )}
      </div>

      <div className="w-80 border-l border-zinc-200 bg-white p-6 overflow-y-auto">
        <button onClick={randomize} className="w-full border border-zinc-200 py-1 mb-6 text-zinc-600 hover:bg-zinc-50 rounded-sm hover:-translate-y-px transition-transform">
          random
        </button>

        <ControlGroup title="SUBJECT">
          {Object.keys(PRESETS).map(key => (
            <TagButton key={key} active={subject === key} onClick={() => { setSubject(key); setCustomSvg(null); }}>
              {key}
            </TagButton>
          ))}
          <TagButton active={!!customSvg} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.svg';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const val = e.target?.result as string;
                  if (val) {
                    setCustomSvg(val);
                    setSubject('custom');
                  }
                };
                reader.readAsText(file);
              }
            };
            input.click();
          }}>
            upload svg
          </TagButton>
        </ControlGroup>

        <ControlGroup title="MATERIAL">
          {['chrome', 'gunmetal', 'porcelain', 'copper'].map(mat => (
            <TagButton key={mat} active={material === mat} onClick={() => setMaterial(mat as MaterialType)}>
              {mat}
            </TagButton>
          ))}
        </ControlGroup>

        <ControlGroup title="DEPTH">
          <div className="flex items-center gap-2">
            <input type="range" min="0.01" max="1" step="0.01" value={depth} onChange={e => setDepth(parseFloat(e.target.value))} className="flex-1" />
            <span className="w-8 text-right">{depth}</span>
          </div>
        </ControlGroup>

        <ControlGroup title="BEVEL">
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="0.2" step="0.01" value={bevel} onChange={e => setBevel(parseFloat(e.target.value))} className="flex-1" />
            <span className="w-8 text-right">{bevel}</span>
          </div>
        </ControlGroup>

        <ControlGroup title="MOTION">
          {['turntable', 'sway', 'pendulum'].map(mot => (
            <TagButton key={mot} active={motion === mot} onClick={() => setMotion(mot as MotionType)}>
              {mot}
            </TagButton>
          ))}
        </ControlGroup>

        <ControlGroup title="FILM">
          <div className="mb-2">
            <div className="flex justify-between text-zinc-400 mb-1 leading-none text-[10px]">
              <span>FRAMES</span>
              <span>{frames}</span>
            </div>
            <input type="range" min="12" max="120" step="1" value={frames} onChange={e => setFrames(parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div className="mb-2">
            <div className="flex justify-between text-zinc-400 mb-1 leading-none text-[10px]">
              <span>FRAME SIZE</span>
              <span>{frameSize}px</span>
            </div>
            <input type="range" min="64" max="512" step="32" value={frameSize} onChange={e => setFrameSize(parseInt(e.target.value))} style={{ width: '100%' }} />
          </div>
        </ControlGroup>

        <button 
          onClick={startBake}
          disabled={isBaking}
          className="w-full bg-black text-white py-2 font-bold disabled:opacity-50 mt-4 rounded-sm"
        >
          {isBaking ? 'baking...' : 'bake strip + poster'}
        </button>

        {spriteSheet && (
          <button 
            onClick={() => {
              const a = document.createElement('a');
              a.href = spriteSheet;
              a.download = `fioreciii-${subject}-${material}-${frames}.png`;
              a.click();
            }}
            className="w-full bg-zinc-800 text-white py-2 font-bold mt-2 rounded-sm"
          >
            exportar sprite sheet
          </button>
        )}

        <button 
          onClick={() => svgObjectRef.current?.exportGLB()}
          className="w-full bg-white border border-zinc-200 text-zinc-800 py-2 font-bold mt-2 rounded-sm hover:bg-zinc-50"
        >
          exportar modelo 3d
        </button>

      </div>
    </div>
  );
}
