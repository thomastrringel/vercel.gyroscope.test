/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { 
  Smartphone, Compass, RotateCcw, AlertCircle, CheckCircle2, 
  ShieldCheck, Share2, ExternalLink, Radio, StopCircle, 
  Magnet, Navigation, Activity
} from 'lucide-react';

// --- Types ---

interface GyroData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

interface MagData {
  x: number | null;
  y: number | null;
  z: number | null;
  isSimulated?: boolean;
}

interface AccelData {
  x: number | null;
  y: number | null;
  z: number | null;
}

// Global sensor types for experimental APIs
declare global {
  interface Window {
    Magnetometer: any;
    Accelerometer: any;
  }
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'gyro' | 'magnetic'>('gyro');
  
  // Gyroscope State
  const [gyroData, setGyroData] = useState<GyroData>({ alpha: 0, beta: 0, gamma: 0 });
  const [isGyroSupported, setIsGyroSupported] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [error, setError] = useState<string | null>(null);

  // Magnetometer State
  const [magData, setMagData] = useState<MagData>({ x: 0, y: 0, z: 0, isSimulated: false });
  const [accelData, setAccelData] = useState<AccelData>({ x: 0, y: 0, z: 0 });
  const [calculatedHeading, setCalculatedHeading] = useState<number | null>(null);
  const [tiltAmount, setTiltAmount] = useState<number | null>(null);
  const [isMagSupported, setIsMagSupported] = useState<boolean | null>(null);

  // Remote Sync State
  const [targetOrigin, setTargetOrigin] = useState<string>('https://example.com');
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const targetWindowRef = useRef<Window | null>(null);

  // --- Callbacks & Logic ---

  /**
   * Calculates the tilt-compensated heading and overall tilt.
   */
  const calculateCompassValues = useCallback((mag: MagData, acc: AccelData) => {
    // 1. Calculate Tilt from Accelerometer (Pitch and Roll)
    const ax = acc.x ?? 0;
    const ay = acc.y ?? 0;
    const az = acc.z ?? 9.81; // Fallback to gravity if missing

    const pitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az));
    const roll = Math.atan2(-ax, az);

    const tiltDeg = Math.sqrt(pitch * pitch + roll * roll) * (180 / Math.PI);
    setTiltAmount(Math.min(90, tiltDeg));

    // 2. Heading Calculation
    // If we have real magnetometer data, we use the formula
    if (mag.x !== null && mag.y !== null && mag.z !== null && !mag.isSimulated) {
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);

      const xh = mag.x * cosP + mag.z * sinP;
      const yh = mag.x * sinR * sinP + mag.y * cosR - mag.z * sinR * cosP;

      let heading = Math.atan2(-yh, xh) * (180 / Math.PI);
      if (heading < 0) heading += 360;
      setCalculatedHeading(heading);
    } 
    // Otherwise fallback to alpha/orientation data (handled in handleOrientation)
  }, []);

  /**
   * Handle Orientation for Page 1 & Compass Fallback
   */
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const data = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
    };
    setGyroData(data);

    // Fallback for Compass if Magnetometer API is missing or blocked
    let heading: number | null = null;
    
    // 1. iOS special property
    if ((event as any).webkitCompassHeading !== undefined) {
      heading = (event as any).webkitCompassHeading;
    } 
    // 2. Absolute orientation (often provided by deviceorientationabsolute)
    else if (event.absolute && event.alpha !== null) {
      heading = (360 - event.alpha) % 360;
    }
    // 3. Last resort alpha
    else if (event.alpha !== null) {
      heading = (360 - event.alpha) % 360;
    }

    if (heading !== null) {
      setCalculatedHeading(heading);
      
      // Update magData ONLY if the real API isn't working
      setMagData(prev => {
        if (!prev.isSimulated && isMagSupported) return prev;
        
        const hRad = (heading! * Math.PI) / 180;
        return {
          x: Math.cos(hRad) * 40,
          y: Math.sin(hRad) * 40,
          z: -20,
          isSimulated: true
        };
      });
    }

    // Broadcast logic
    if (isBroadcasting && targetWindowRef.current) {
      try {
        if (!targetWindowRef.current.closed) {
          targetWindowRef.current.postMessage({ type: 'GYRO_DATA', payload: data, timestamp: Date.now() }, targetOrigin);
        } else {
          setIsBroadcasting(false);
          targetWindowRef.current = null;
        }
      } catch (err) { /* ignore */ }
    }
  }, [isBroadcasting, targetOrigin, isMagSupported]);

  /**
   * Motion handler for generic tilt calculation fallback
   */
  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    if (event.accelerationIncludingGravity) {
      setAccelData({
        x: event.accelerationIncludingGravity.x,
        y: event.accelerationIncludingGravity.y,
        z: event.accelerationIncludingGravity.z,
      });
    }
  }, []);

  // --- Effect: Manage Event Listeners ---
  useEffect(() => {
    setIsGyroSupported(!!window.DeviceOrientationEvent);
    const hasMagAPI = 'Magnetometer' in window && 'Accelerometer' in window;
    setIsMagSupported(hasMagAPI);

    if (permissionStatus === 'granted') {
      window.addEventListener('deviceorientation', handleOrientation);
      window.addEventListener('deviceorientationabsolute', handleOrientation);
      window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [permissionStatus, handleOrientation, handleMotion]);

  const requestPermission = async () => {
    // 1. DeviceOrientation & Motion (iOS requirement)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            await (DeviceMotionEvent as any).requestPermission();
          }
          setPermissionStatus('granted');
        } else {
          setPermissionStatus('denied');
        }
      } catch (err) {
        setError("Sensor access failed.");
      }
    } else {
      // Android / Older browsers
      setPermissionStatus('granted');
    }

    // 2. Try Magnetometer API (Mostly Android/Chrome with flags)
    if ('Magnetometer' in window) {
      try {
        const mag = new window.Magnetometer({ frequency: 30 });
        const acc = new window.Accelerometer({ frequency: 30 });

        mag.addEventListener('reading', () => {
          setMagData({ x: mag.x, y: mag.y, z: mag.z, isSimulated: false });
          setIsMagSupported(true);
        });

        acc.addEventListener('reading', () => {
          setAccelData({ x: acc.x, y: acc.y, z: acc.z });
        });

        mag.start();
        acc.start();
      } catch (e) {
        console.warn("Magnetometer API access denied.");
      }
    }
  };

  useEffect(() => {
    if (permissionStatus === 'granted') {
      calculateCompassValues(magData, accelData);
    }
  }, [magData, accelData, permissionStatus, calculateCompassValues]);

  // --- Navigation Helpers ---

  const goToGyro = () => setActiveTab('gyro');
  const goToMag = () => setActiveTab('magnetic');

  const handleDragEnd = (_: any, info: any) => {
    // Highly sensitive for mobile devices
    const threshold = 30;
    const velocityThreshold = 100;
    
    if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      if (activeTab === 'gyro') setActiveTab('magnetic');
    } else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      if (activeTab === 'magnetic') setActiveTab('gyro');
    }
  };

  // --- Broadcast Utils ---

  const startBroadcast = () => {
    setBroadcastError(null);
    try {
      new URL(targetOrigin);
    } catch (e) {
      setBroadcastError("Invalid URL.");
      return;
    }
    const newWin = window.open(targetOrigin, '_blank');
    if (!newWin) {
      setBroadcastError("Popup blocked!");
      return;
    }
    targetWindowRef.current = newWin;
    setIsBroadcasting(true);
  };

  const formatValue = (val: number | null) => (val !== null ? val.toFixed(2) : 'N/A');

  // --- Render Helpers ---

  const renderGyroPage = () => (
    <div className="w-full flex-shrink-0 flex flex-col gap-6">
      {/* Page Heading */}
      <div className="text-center">
        <div className="inline-flex p-2 bg-indigo-50 text-indigo-600 rounded-full mb-2">
          <Activity size={16} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gyroscope Explorer</h1>
        <p className="text-slate-500 text-sm">Alpha, Beta, Gamma values</p>
      </div>

      {/* Sensor Data Card */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        {permissionStatus !== 'granted' ? (
          <div className="flex flex-col items-center py-4">
             <ShieldCheck size={48} strokeWidth={1.5} className="text-indigo-600 mb-4" />
             <p className="text-center text-slate-600 text-sm mb-6">Permission required to read motion sensors.</p>
             <button onClick={requestPermission} className="w-full py-4 bg-indigo-600 text-white font-semibold rounded-2xl">Enable Sensors</button>
          </div>
        ) : (
          <div className="space-y-4">
            {[
              { label: 'Alpha (Z-axis)', val: gyroData.alpha, icon: Compass, color: 'text-indigo-600' },
              { label: 'Beta (X-axis)', val: gyroData.beta, icon: RotateCcw, color: 'text-emerald-600', extra: 'rotate-90' },
              { label: 'Gamma (Y-axis)', val: gyroData.gamma, icon: RotateCcw, color: 'text-amber-600' }
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 text-slate-700">
                <div className={`w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center ${s.color}`}>
                  <s.icon size={20} className={s.extra} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{s.label}</p>
                  <p className="text-xl font-mono font-bold">{formatValue(s.val)}°</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Visualizer */}
      {permissionStatus === 'granted' && (
        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden relative min-h-[200px]">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <div className="absolute inset-0 border-2 border-slate-100 rounded-full"></div>
            <motion.div
              animate={{ x: (gyroData.gamma || 0) * 1.2, y: (gyroData.beta || 0) * 1.2, rotateZ: gyroData.alpha || 0 }}
              className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-xl flex items-center justify-center"
            />
          </div>
        </section>
      )}

      {/* Sync Card */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <label className="text-xs font-bold text-slate-400 uppercase">Remote Sync</label>
          {isBroadcasting && <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 animate-pulse"><Radio size={12} /> LIVE</span>}
        </div>
        <div className="space-y-3">
          <input type="text" value={targetOrigin} onChange={(e) => setTargetOrigin(e.target.value)} disabled={isBroadcasting} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-mono" />
          {!isBroadcasting ? (
            <button onClick={startBroadcast} disabled={permissionStatus !== 'granted'} className="w-full py-3 bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2">
              <ExternalLink size={14} /> Open & Start Sync
            </button>
          ) : (
            <button onClick={() => setIsBroadcasting(false)} className="w-full py-3 bg-red-500 text-white text-xs font-semibold rounded-xl">Stop Sync</button>
          )}
        </div>
      </section>
    </div>
  );

  const renderMagPage = () => (
    <div className="w-full flex-shrink-0 flex flex-col gap-6">
      {/* Page Heading */}
      <div className="text-center">
        <div className="inline-flex p-2 bg-rose-50 text-rose-600 rounded-full mb-2">
          <Magnet size={16} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Magnetometer Explorer</h1>
        <p className="text-slate-500 text-sm">Magnetic field & Compass</p>
      </div>

      {/* Raw Data Card */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
          {magData.isSimulated ? 'Estimated Magnetic Vector' : 'Raw Magnetic Field (μT)'}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'X', val: magData.x, color: 'text-rose-500' },
            { label: 'Y', val: magData.y, color: 'text-indigo-500' },
            { label: 'Z', val: magData.z, color: 'text-emerald-500' }
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 p-3 rounded-2xl text-center">
              <p className={`text-[10px] font-bold ${s.color} mb-1 uppercase tracking-tighter`}>{s.label}-Axis</p>
              <p className="text-lg font-mono font-bold text-slate-700">{formatValue(s.val)}</p>
            </div>
          ))}
        </div>
        {magData.isSimulated && (
           <p className="mt-4 text-[8px] text-amber-600 bg-amber-50 p-2 rounded-lg flex items-center gap-1 leading-tight">
             <AlertCircle size={10} /> Rohe Magnetometer-Daten werden von diesem Browser blockiert. Die Werte werden aus der Geräteorientierung geschätzt.
           </p>
        )}
      </section>

      {/* Compass Calculation Card */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full mb-6">Tilt-Compensated Heading</h2>
        
        <div className="relative w-48 h-48 flex items-center justify-center bg-slate-50 rounded-full border border-slate-100 mb-8 overflow-hidden shadow-inner">
          <div className="absolute top-2 w-1 h-3 bg-rose-500 rounded-full z-10"></div>
          {/* Compass Rose */}
          <motion.div 
            animate={{ rotate: -(calculatedHeading || 0) }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            className="w-40 h-40 relative"
          >
            {[0, 90, 180, 270].map((deg) => (
              <div 
                key={deg} 
                className="absolute w-full h-full text-xs font-bold text-slate-300 flex justify-center py-2"
                style={{ transform: `rotate(${deg}deg)` }}
              >
                {deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : 'W'}
              </div>
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
               <Navigation size={48} className="text-slate-800" strokeWidth={1} />
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-8 w-full">
          <div className="text-center">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Heading</p>
            <p className="text-3xl font-mono font-black text-rose-600">{(calculatedHeading || 0).toFixed(0)}°</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Tilt</p>
            <p className="text-3xl font-mono font-black text-indigo-600">{(tiltAmount || 0).toFixed(0)}°</p>
          </div>
        </div>
      </section>
      
      <p className="text-[10px] text-slate-400 text-center px-4 leading-relaxed italic">
        The heading is corrected for device pitch and roll using accelerometer gravity readings.
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-50 text-slate-900 font-sans overflow-hidden select-none">
      {/* Navigation Dots - Now clickable as a fallback */}
      <div className="absolute top-0 left-0 w-full z-50 px-6 py-10 flex justify-center gap-5">
        <button 
          onClick={goToGyro}
          className="p-2 transition-transform active:scale-90"
          aria-label="Go to Gyroscope"
        >
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${activeTab === 'gyro' ? 'bg-indigo-600 ring-4 ring-indigo-100 scale-125' : 'bg-slate-300'}`} />
        </button>
        <button 
          onClick={goToMag}
          className="p-2 transition-transform active:scale-90"
          aria-label="Go to Magnetometer"
        >
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${activeTab === 'magnetic' ? 'bg-rose-600 ring-4 ring-rose-100 scale-125' : 'bg-slate-300'}`} />
        </button>
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        animate={{ x: activeTab === 'gyro' ? '0%' : '-100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
        style={{ touchAction: 'pan-y' }}
        className="h-full flex w-full cursor-grab active:cursor-grabbing"
      >
        {/* All content wrapped in scrollable containers for small screens */}
        <div className="w-full flex-shrink-0 h-full overflow-y-auto px-6 py-16 scrollbar-hide">
          <div className="max-w-md mx-auto min-h-full flex flex-col">
            {renderGyroPage()}
          </div>
        </div>

        <div className="w-full flex-shrink-0 h-full overflow-y-auto px-6 py-16 scrollbar-hide">
          <div className="max-w-md mx-auto min-h-full flex flex-col">
            {renderMagPage()}
          </div>
        </div>
      </motion.div>

      {/* Swipe Hint */}
      <div className="absolute bottom-12 left-0 w-full text-center pointer-events-none opacity-30">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse">
          {activeTab === 'gyro' ? '← Swipe for Magnetic' : 'Swipe for Gyroscope →'}
        </p>
      </div>
    </div>
  );
}
