// Bodyweight exercise library (mat only, plus an optional resistance band).
// Cues are in Thai; names stay in English like a pro training app.

export interface Level { name: string; th: string }
export interface Exercise {
  id: string;
  name: string;
  th: string;
  pattern: 'push' | 'squat' | 'lunge' | 'hinge' | 'pull' | 'core' | 'calf';
  mode: 'reps' | 'hold';
  perSide?: boolean;
  levels: Level[];
  start: number;
  cues: string[];
  safety?: string;
  reflux?: string;
  needsBand?: boolean;
}

export interface ProgramItem { ex: string; sets: number; min: number; max: number; rest: number; note?: string }
export interface Program { id: 'A' | 'B' | 'C'; name: string; focus: string; items: ProgramItem[] }

export const EXERCISES: Record<string, Exercise> = {
  pushup: {
    id: 'pushup',
    name: 'Push-up',
    th: 'วิดพื้น',
    pattern: 'push',
    mode: 'reps',
    start: 3,
    levels: [
      { name: 'Wall push-up', th: 'ดันกำแพง' },
      { name: 'Incline push-up', th: 'มือวางบนขอบโต๊ะ/ขอบเตียง' },
      { name: 'Knee push-up', th: 'วางเข่า' },
      { name: 'Push-up', th: 'วิดพื้นเต็มท่า' },
      { name: 'Tempo push-up 3-1-1', th: 'ลง 3 วิ ค้าง 1 วิ ขึ้น 1 วิ' },
      { name: 'Deficit push-up', th: 'มือวางบนหนังสือหนาสองกอง ลงได้ลึกกว่าเดิม' },
      { name: 'Archer push-up', th: 'ถ่ายน้ำหนักไปแขนข้างเดียว อีกข้างเหยียด' },
      { name: 'One-arm incline push-up', th: 'แขนเดียว มือวางบนที่สูง' },
    ],
    cues: [
      'มือกว้างกว่าไหล่เล็กน้อย กางนิ้วกระจายน้ำหนัก',
      'ศอกทำมุมราว 45° กับลำตัว ไม่กางออกข้าง',
      'เกร็งก้นและหน้าท้อง ตัวตรงเป็นแผ่นเดียวตั้งแต่หัวถึงส้นเท้า',
      'ลงจนอกห่างพื้นราวหนึ่งกำปั้น แล้วดันขึ้นพร้อมหายใจออก',
    ],
    safety: 'ถ้าเจ็บข้อมือ ให้ทำบนกำปั้นบนเสื่อ หรือถอยไปใช้ท่าที่ง่ายกว่า 1 ระดับ',
  },
  pike: {
    id: 'pike',
    name: 'Pike push-up',
    th: 'วิดพื้นแบบก้นโด่ง (เน้นไหล่)',
    pattern: 'push',
    mode: 'reps',
    start: 0,
    levels: [
      { name: 'Pike push-up', th: 'เท้าอยู่บนพื้น' },
      { name: 'Elevated pike push-up', th: 'เท้าวางบนขอบเตียง' },
      { name: 'Deficit pike push-up', th: 'มือวางบนหนังสือ ลงลึกขึ้น' },
    ],
    cues: [
      'ยกก้นสูงให้ตัวเป็นรูปตัว V คว่ำ',
      'งอศอกให้ศีรษะลงไปข้างหน้ามือเล็กน้อยเป็นรูปสามเหลี่ยม',
      'ดันกลับขึ้นแนวเดิม หายใจออกตอนดัน',
    ],
    reflux: 'ท่านี้ศีรษะต่ำกว่าสะโพก ถ้ามีอาการแสบอกหรือเรอระหว่างทำ ให้เปลี่ยนเป็น Tempo push-up แทน',
  },
  splitsquat: {
    id: 'splitsquat',
    name: 'Split squat',
    th: 'สควอทขาหน้าขาหลัง',
    pattern: 'squat',
    mode: 'reps',
    perSide: true,
    start: 1,
    levels: [
      { name: 'Bodyweight squat', th: 'สควอทสองขา' },
      { name: 'Split squat', th: 'ขาหน้าขาหลังอยู่บนพื้น' },
      { name: 'Paused split squat', th: 'ค้างล่างสุด 2 วิ' },
      { name: 'Bulgarian split squat', th: 'เท้าหลังวางบนขอบเตียง/โซฟาที่มั่นคง' },
      { name: 'Bulgarian 1½ rep', th: 'ลงสุด ขึ้นครึ่งทาง ลงอีกครั้ง แล้วค่อยขึ้น' },
      { name: 'Assisted shrimp squat', th: 'มือแตะผนังช่วยทรงตัว' },
    ],
    cues: [
      'ยืนก้าวขายาวราวหนึ่งก้าวครึ่ง ลำตัวตั้งตรง',
      'ลดเข่าหลังลงตรงๆ จนเกือบแตะพื้น',
      'เข่าหน้าชี้ทิศเดียวกับปลายเท้า ส้นเท้าหน้าติดพื้น',
      'ดันส้นเท้าหน้าเพื่อลุกขึ้น ทำครบข้างหนึ่งแล้วสลับ',
    ],
    safety: 'ท่า Bulgarian ต้องวางเท้าบนของที่ไม่ลื่นไถล ถ้าไม่มั่นใจให้อยู่ระดับ Paused split squat',
  },
  lunge: {
    id: 'lunge',
    name: 'Reverse lunge',
    th: 'ก้าวถอยหลังย่อตัว',
    pattern: 'lunge',
    mode: 'reps',
    perSide: true,
    start: 0,
    levels: [
      { name: 'Reverse lunge', th: 'ก้าวถอยหลังแล้วย่อ' },
      { name: 'Paused reverse lunge', th: 'ค้างล่างสุด 2 วิ' },
      { name: 'Deficit reverse lunge', th: 'ขาหน้ายืนบนหนังสือหนา' },
    ],
    cues: [
      'ก้าวขาหลังถอยไปยาวๆ แล้วย่อเข่าหลังลงตรงๆ',
      'น้ำหนักอยู่ขาหน้า ลำตัวเอนมาข้างหน้าได้เล็กน้อย',
      'ดันส้นเท้าหน้ากลับมายืนตรง',
    ],
    safety: 'ก้าวถอยหลังปลอดภัยกับเข่ากว่าก้าวไปข้างหน้า',
  },
  bridge: {
    id: 'bridge',
    name: 'Glute bridge',
    th: 'ยกสะโพก',
    pattern: 'hinge',
    mode: 'reps',
    start: 1,
    levels: [
      { name: 'Glute bridge', th: 'สองขา' },
      { name: 'Single-leg glute bridge', th: 'ขาเดียว' },
      { name: 'Hip thrust', th: 'หลังพิงขอบโซฟา/เตียง' },
      { name: 'Single-leg hip thrust', th: 'หลังพิงขอบ ขาเดียว' },
    ],
    cues: [
      'นอนหงาย ชันเข่า ส้นเท้าห่างก้นราวหนึ่งฝ่ามือ',
      'ดันส้นเท้าลงพื้น ยกสะโพกจนลำตัวตรงจากเข่าถึงไหล่',
      'บีบก้นค้างบนสุด 1 วิ ไม่แอ่นหลัง',
    ],
  },
  sldl: {
    id: 'sldl',
    name: 'Single-leg RDL',
    th: 'ก้มพับสะโพกขาเดียว',
    pattern: 'hinge',
    mode: 'reps',
    perSide: true,
    start: 0,
    levels: [
      { name: 'Assisted single-leg RDL', th: 'มือแตะผนังช่วยทรงตัว' },
      { name: 'Single-leg RDL', th: 'ไม่แตะอะไร' },
      { name: 'Paused single-leg RDL', th: 'ค้างล่างสุด 2 วิ' },
    ],
    cues: [
      'ยืนขาเดียว เข่างอเล็กน้อย',
      'พับสะโพกให้ลำตัวเอนไปข้างหน้า ขาอีกข้างยื่นไปข้างหลังเป็นเส้นตรงกับลำตัว',
      'หลังตรงตลอด ลงจนรู้สึกตึงต้นขาด้านหลัง แล้วดันสะโพกกลับขึ้น',
    ],
  },
  ytw: {
    id: 'ytw',
    name: 'Prone Y-T-W',
    th: 'นอนคว่ำยกแขนเป็นตัว Y T W',
    pattern: 'pull',
    mode: 'reps',
    start: 0,
    levels: [
      { name: 'Prone Y-T-W', th: 'ท่าละ 1 ครั้งต่อรอบ' },
      { name: 'Prone Y-T-W + 2 s hold', th: 'ค้างบนสุดท่าละ 2 วิ' },
      { name: 'Reverse snow angel', th: 'นอนคว่ำ วาดแขนจากสะโพกขึ้นเหนือศีรษะช้าๆ' },
    ],
    cues: [
      'นอนคว่ำบนเสื่อ หน้าผากแตะผ้าขนหนูพับ',
      'ยกแขนเป็นตัว Y แล้ว T แล้ว W บีบสะบักเข้าหากันทุกครั้ง',
      'ยกแค่เท่าที่ไหล่ไม่ยักขึ้นหาหู นับหนึ่งรอบเมื่อครบ Y-T-W',
    ],
  },
  bandrow: {
    id: 'bandrow',
    name: 'Band row',
    th: 'ดึงยางยืดเข้าหาลำตัว',
    pattern: 'pull',
    mode: 'reps',
    start: 0,
    needsBand: true,
    levels: [
      { name: 'Seated band row', th: 'นั่งเหยียดขา คล้องยางที่ฝ่าเท้า' },
      { name: 'Standing band row', th: 'คล้องยางกับ door anchor ระดับอก' },
      { name: 'Paused band row', th: 'ค้างตอนดึงสุด 2 วิ หรือใช้ยางแข็งขึ้น' },
      { name: 'Single-arm band row', th: 'ทีละแขน' },
    ],
    cues: [
      'ตรวจยางก่อนใช้ทุกครั้ง ถ้ามีรอยแตกให้เลิกใช้',
      'ดึงศอกไปข้างหลังชิดลำตัว บีบสะบักเข้าหากัน',
      'ปล่อยกลับช้าๆ 2 วิ อย่าให้ยางดีดกลับเอง',
    ],
    safety: 'ติด door anchor ด้านที่ประตูปิดเข้าหาวงกบ และล็อกประตูทุกครั้ง',
  },
  superman: {
    id: 'superman',
    name: 'Superman hold',
    th: 'นอนคว่ำยกแขนขาค้าง',
    pattern: 'pull',
    mode: 'hold',
    start: 0,
    levels: [
      { name: 'Alternating superman', th: 'สลับแขนขาทีละคู่' },
      { name: 'Superman hold', th: 'ยกทั้งแขนและขาพร้อมกัน' },
    ],
    cues: ['นอนคว่ำ ยกอก แขน และขาขึ้นเล็กน้อย', 'มองพื้น คอตรง ค้างไว้โดยหายใจตามปกติ'],
  },
  curlup: {
    id: 'curlup',
    name: 'McGill curl-up',
    th: 'เคิร์ลอัปแบบรักษาหลัง',
    pattern: 'core',
    mode: 'reps',
    start: 0,
    levels: [
      { name: 'Curl-up 10 s holds', th: 'ค้างครั้งละ 10 วิ' },
      { name: 'Curl-up + elbows up', th: 'ยกศอกลอยจากพื้น' },
    ],
    cues: [
      'นอนหงาย ขาหนึ่งเหยียด ขาหนึ่งชันเข่า มือรองใต้หลังส่วนล่าง',
      'ยกศีรษะและไหล่ขึ้นเล็กน้อยโดยคอไม่พับ ค้าง 10 วิ',
      'นับหนึ่งครั้งต่อการค้าง 10 วิ',
    ],
    reflux: 'ไม่ใช่ครันช์ แรงกดท้องน้อยกว่า แต่ยังควรทำตอนท้องไม่อิ่ม',
  },
  sideplank: {
    id: 'sideplank',
    name: 'Side plank',
    th: 'แพลงก์ด้านข้าง',
    pattern: 'core',
    mode: 'hold',
    perSide: true,
    start: 1,
    levels: [
      { name: 'Knee side plank', th: 'วางเข่า' },
      { name: 'Side plank', th: 'วางเท้า' },
      { name: 'Side plank + top leg lift', th: 'ยกขาบนค้าง' },
    ],
    cues: ['ศอกอยู่ใต้ไหล่ ลำตัวตรงจากศีรษะถึงเท้า', 'ดันสะโพกขึ้น ไม่ให้ตกลงมา ค้างแล้วสลับข้าง'],
  },
  birddog: {
    id: 'birddog',
    name: 'Bird dog',
    th: 'คลานสี่ขายกแขนขาตรงข้าม',
    pattern: 'core',
    mode: 'reps',
    perSide: true,
    start: 0,
    levels: [
      { name: 'Bird dog 10 s holds', th: 'ค้างครั้งละ 10 วิ' },
      { name: 'Bird dog + sweep', th: 'ยกค้างแล้วลากศอกหาเข่าช้าๆ' },
    ],
    cues: ['คุกเข่าสี่ขา มือใต้ไหล่ เข่าใต้สะโพก', 'ยกแขนหนึ่งกับขาตรงข้ามให้ขนานพื้น ค้าง 10 วิ ลำตัวนิ่ง'],
  },
  deadbug: {
    id: 'deadbug',
    name: 'Dead bug',
    th: 'นอนหงายยกแขนขาสลับ',
    pattern: 'core',
    mode: 'reps',
    perSide: true,
    start: 0,
    levels: [
      { name: 'Dead bug', th: 'สลับแขนขาช้าๆ' },
      { name: 'Dead bug + 3 s exhale', th: 'หายใจออกยาว 3 วิ ตอนเหยียด' },
    ],
    cues: ['นอนหงาย ยกแขนตั้งฉาก ขางอ 90°', 'หลังส่วนล่างแนบเสื่อตลอด เหยียดแขนกับขาตรงข้ามลงช้าๆ แล้วสลับ'],
  },
  calf: {
    id: 'calf',
    name: 'Calf raise',
    th: 'เขย่งปลายเท้า',
    pattern: 'calf',
    mode: 'reps',
    start: 0,
    levels: [
      { name: 'Double-leg calf raise', th: 'สองขา' },
      { name: 'Single-leg calf raise', th: 'ขาเดียว มือแตะผนัง' },
      { name: 'Single-leg deficit calf raise', th: 'ยืนบนขั้นบันได ส้นเท้าลงต่ำกว่าขั้น' },
    ],
    cues: ['เขย่งสูงสุดค้าง 1 วิ', 'ลดส้นลงช้า 2 วิ'],
  },
};

/** The pull slot switches to the band once the user has one. */
export const PROGRAMS: Program[] = [
  {
    id: 'A',
    name: 'Full Body A',
    focus: 'Push · Squat · Bridge',
    items: [
      { ex: 'pushup', sets: 4, min: 8, max: 15, rest: 90 },
      { ex: 'splitsquat', sets: 3, min: 8, max: 12, rest: 90 },
      { ex: 'bridge', sets: 3, min: 10, max: 15, rest: 60 },
      { ex: 'PULL', sets: 3, min: 8, max: 12, rest: 60 },
      { ex: 'sideplank', sets: 2, min: 20, max: 40, rest: 45 },
      { ex: 'birddog', sets: 2, min: 5, max: 6, rest: 30 },
    ],
  },
  {
    id: 'B',
    name: 'Full Body B',
    focus: 'Shoulders · Lunge · Hinge',
    items: [
      { ex: 'pike', sets: 3, min: 6, max: 10, rest: 90 },
      { ex: 'pushup', sets: 3, min: 8, max: 15, rest: 90 },
      { ex: 'lunge', sets: 3, min: 8, max: 12, rest: 90 },
      { ex: 'sldl', sets: 3, min: 8, max: 12, rest: 60 },
      { ex: 'PULL', sets: 3, min: 8, max: 12, rest: 60 },
      { ex: 'curlup', sets: 2, min: 5, max: 6, rest: 30 },
      { ex: 'calf', sets: 2, min: 12, max: 20, rest: 45 },
    ],
  },
  {
    id: 'C',
    name: 'Full Body C',
    focus: 'Push volume · Single-leg · Core',
    items: [
      { ex: 'pushup', sets: 4, min: 8, max: 15, rest: 90 },
      { ex: 'splitsquat', sets: 3, min: 8, max: 12, rest: 90 },
      { ex: 'bridge', sets: 3, min: 10, max: 15, rest: 60 },
      { ex: 'PULL', sets: 3, min: 8, max: 12, rest: 60 },
      { ex: 'superman', sets: 2, min: 20, max: 30, rest: 45 },
      { ex: 'deadbug', sets: 2, min: 6, max: 8, rest: 30 },
    ],
  },
];

export const WARMUP = [
  { name: 'March in place', th: 'ย่ำเท้าอยู่กับที่ แกว่งแขน', sec: 60 },
  { name: 'Arm circles', th: 'หมุนแขนไปหน้า 10 ครั้ง ไปหลัง 10 ครั้ง', sec: 30 },
  { name: 'Hip hinge', th: 'มือแตะสะโพก พับสะโพกไปหลัง 10 ครั้ง', sec: 30 },
  { name: 'Bodyweight squat', th: 'สควอทช้าๆ 10 ครั้ง', sec: 45 },
  { name: 'Scap push-up', th: 'ท่าวิดพื้น แขนเหยียด ขยับแค่สะบักเข้าออก 10 ครั้ง', sec: 30 },
  { name: 'Cat-camel', th: 'คุกเข่าสี่ขา โก่งหลังและแอ่นหลังช้าๆ 6 ครั้ง', sec: 45 },
];

export function programForDay(weekday: number, workoutDays: number[]): Program | null {
  const idx = workoutDays.indexOf(weekday);
  if (idx < 0) return null;
  return PROGRAMS[idx % PROGRAMS.length];
}

export function resolveExercise(id: string, hasBand: boolean): Exercise {
  if (id === 'PULL') return hasBand ? EXERCISES.bandrow : EXERCISES.ytw;
  return EXERCISES[id];
}

export interface BreathPreset { id: string; name: string; th: string; minutes: number; inhale: number; exhale: number; hold?: number; openMouth?: boolean }
export const BREATH_PRESETS: BreathPreset[] = [
  { id: 'meal', name: 'After meal', th: 'หลังอาหาร นั่งตัวตรง ช่วยลดกรดไหลย้อนหลังมื้อ', minutes: 15, inhale: 4, exhale: 6 },
  { id: 'daily', name: 'Daily practice', th: 'ฝึกประจำวัน สะสมให้ครบวันละ 30 นาที', minutes: 10, inhale: 4, exhale: 6 },
  { id: 'sleep', name: 'Before sleep', th: 'ก่อนนอน ตะแคงซ้าย หายใจออกยาว', minutes: 10, inhale: 4, exhale: 7 },
  { id: 'sos', name: 'Belch SOS', th: 'ใช้ทันทีที่รู้สึกจะเรอ เปิดปากเล็กน้อย', minutes: 2, inhale: 4, exhale: 6, openMouth: true },
];
