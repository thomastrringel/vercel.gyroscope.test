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
}

interface AccelData {
  x: number | null;
  y: number | null;
  z: number | null;
}

// Global sensor types for experimental APIs since standard TS doesn't have them
declare global {
  interface Window {
    Magnetometer: any;
    Accelerometer: any;
  }
}

// --- Main App Component ---

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'gyro' | 'magnetic'>('gyro');
  
  // Gyroscope State
  const [gyroData, setGyroData] = useState<GyroData>({ alpha: 0, beta: 0, gamma: 0 });
  const [isGyroSupported, setIsGyroSupported] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [error, setError] = useState<string | null>(null);

  // Magnetometer State
  const [magData, setMagData] = useState<MagData>({ x: 0, y: 0, z: 0 });
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
   * Uses standard mathematical formulas to correct magnetometer readings 
   * based on the pitch and roll derived from accelerometer (gravity).
   */
  const calculateCompassValues = (mag: MagData, acc: AccelData) => {
    if (mag.x === null || acc.x === null) return;

    // 1. Calculate Pitch and Roll from Accelerometer
    // Note: This assumes acc values include gravity (m/s^2)
    const pitch = Math.atan2(acc.y, Math.sqrt(acc.x * acc.x + acc.z * acc.z));
    const roll = Math.atan2(-acc.x, acc.z);

    // 2. Displayable tilt (magnitude of pitch/roll deviation from vertical)
    const tiltDeg = Math.sqrt(pitch * pitch + roll * roll) * (180 / Math.PI);
    setTiltAmount(Math.min(90, tiltDeg));

    // 3. Tilt-compensated Magnetometer readings (Xh, Yh)
    // We project the 3D magnetic vector onto the horizontal plane
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);

    const xh = mag.x * cosP + mag.z * sinP;
    const yh = mag.x * sinR * sinP + mag.y * cosR - mag.z * sinR * cosP;

    // 4. Calculate Heading in Degrees
    let heading = Math.atan2(-yh, xh) * (180 / Math.PI);
    if (heading < 0) heading += 360;

    setCalculatedHeading(heading);
  };

  /**
   * Handle Orientation for Page 1
   */
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const data = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
    };
    setGyroData(data);

    // Broadcast if enabled
    if (isBroadcasting && targetWindowRef.current) {
      try {
        if (targetWindowRef.current.closed) {
          setIsBroadcasting(false);
          setBroadcastError("Target window was closed.");
          targetWindowRef.current = null;
          return;
        }
        targetWindowRef.current.postMessage({
          type: 'GYRO_DATA',
          payload: data,
          timestamp: Date.now()
        }, targetOrigin);
        setBroadcastError(null);
      } catch (err) {
        setBroadcastError("Failed to send data.");
      }
    }
  }, [isBroadcasting, targetOrigin]);

  /**
   * Permission & Initialization
   */
  useEffect(() => {
    // Check support
    setIsGyroSupported(!!window.DeviceOrientationEvent);
    
    // Magnetometer API is newer/experimental on web
    const hasMag = 'Magnetometer' in window && 'Accelerometer' in window;
    setIsMagSupported(hasMag);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [handleOrientation]);

  /**
   * Request permission for sensors
   */
  const requestPermission = async () => {
    // 1. DeviceOrientation Permission (iOS requirement)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionStatus('granted');
          window.addEventListener('deviceorientation', handleOrientation);
        } else {
          setPermissionStatus('denied');
          setError("Permission denied.");
        }
      } catch (err) {
        setError("Error requesting permission.");
      }
    } else {
      setPermissionStatus('granted');
      window.addEventListener('deviceorientation', handleOrientation);
    }

    // 2. Initialize Magnetometer & Accelerometer if supported (Generic Sensor API)
    if (isMagSupported) {
      try {
        const mag = new window.Magnetometer({ frequency: 30 });
        const acc = new window.Accelerometer({ frequency: 30 });

        mag.addEventListener('reading', () => {
          const newData = { x: mag.x, y: mag.y, z: mag.z };
          setMagData(newData);
        });

        acc.addEventListener('reading', () => {
          const newData = { x: acc.x, y: acc.y, z: acc.z };
          setAccelData(newData);
        });

        mag.start();
        acc.start();
      } catch (e) {
        console.warn("Magnetometer failed to start:", e);
      }
    }
  };

  /**
   * Calculation bridge
   */
  useEffect(() => {
    if (permissionStatus === 'granted') {
      calculateCompassValues(magData, accelData);
    }
  }, [magData, accelData, permissionStatus]);

  // --- Navigation Helpers ---

  const switchTab = (dir: 'left' | 'right') => {
    if (dir === 'left' && activeTab === 'gyro') setActiveTab('magnetic');
    if (dir === 'right' && activeTab === 'magnetic') setActiveTab('gyro');
  };

  const handleDragEnd = (_: any, info: any) => {
    const threshold = 50;
    if (info.offset.x < -threshold) switchTab('left');
    if (info.offset.x > threshold) switchTab('right');
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
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Raw Magnetic Field (μT)</h2>
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
        {!isMagSupported && (
           <p className="mt-4 text-[10px] text-amber-600 bg-amber-50 p-2 rounded-lg flex items-center gap-1">
             <AlertCircle size={10} /> Note: Magnetometer API not supported.
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
    <div className="fixed inset-0 bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Header Container */}
      <div className="absolute top-0 left-0 w-full z-20 px-6 py-8 flex justify-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeTab === 'gyro' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
        <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeTab === 'magnetic' ? 'bg-rose-500' : 'bg-slate-300'}`} />
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={{ x: activeTab === 'gyro' ? '0%' : '-100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
