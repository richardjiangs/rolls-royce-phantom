export const MPH = 0.44704;

export const SPEC = {
  massKg: 2560,
  rotInertia: 1.045,
  peakPowerW: 420000,
  peakTorqueNm: 900,
  idleRpm: 600,
  redlineRpm: 5500,
  finalDrive: 2.81,
  wheelRadiusM: 0.367,
  dragCd: 0.37,
  frontalAreaM2: 2.75,
  rollingResistance: 0.012,
  airDensity: 1.225,
  drivelineEff: 0.88,
  topSpeedMps: 155 * MPH,
  brakeMaxMps2: 11.3,
  tractionCapN: 2560 * 9.81 * 0.641,
  shiftTimeS: 0.18,
  gearRatios: [4.71, 3.14, 2.11, 1.67, 1.29, 1.00, 0.84, 0.67],
  reverseRatio: 3.32
};
