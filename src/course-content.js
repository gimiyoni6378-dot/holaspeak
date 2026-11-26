export const COURSE_CATALOG = [
  {
    id: 'daily',
    name: '일상 회화',
    description: '인사하고, 부탁하고, 내 이야기를 해요.',
    icon: '☀',
    firstMission: '처음 만났을 때 인사하기',
    secondMission: '고마움과 부탁 표현 기억하기',
    nextMission: '나를 소개하는 한 문장 말하기',
    phrase: { spanish: 'Me llamo Minji.', phonetic: '메 야모 민지', korean: '제 이름은 민지예요.' },
    units: ['첫 인사', '고마움과 부탁', '자기소개 말하기', '카페에서 주문하기'],
  },
  {
    id: 'travel',
    name: '여행 스페인어',
    description: '여행 중 자주 만나는 상황을 연습해요.',
    icon: '✈',
    firstMission: '여행지에서 먼저 인사하기',
    secondMission: '필요한 것을 정중하게 부탁하기',
    nextMission: '카페에서 주문 한마디 하기',
    phrase: { spanish: 'Un café, por favor.', phonetic: '운 카페, 뽀르 파보르', korean: '커피 한 잔 주세요.' },
    units: ['여행 첫 인사', '부탁과 감사', '카페에서 주문하기', '길을 물어보기'],
  },
  {
    id: 'sounds',
    name: '발음부터 차근차근',
    description: '쉬운 단어로 소리와 기본 문장을 익혀요.',
    icon: 'Ñ',
    firstMission: '스페인어 모음과 인사 소리 듣기',
    secondMission: '자주 쓰는 소리와 단어 복습하기',
    nextMission: '또렷한 첫 문장 말하기',
    phrase: { spanish: 'Hola, ¿cómo estás?', phonetic: '올라, 꼬모 에스따스', korean: '안녕, 어떻게 지내?' },
    units: ['모음과 첫 인사', '소리 규칙 복습', '안부 묻기', '첫 문장 말하기'],
  },
];

export const COURSE_WORDS = {
  daily: [
    ['Hola', '올라', '안녕'],
    ['Buenos días', '부에노스 디아스', '좋은 아침이에요'],
    ['Gracias', '그라시아스', '고마워요'],
    ['Por favor', '뽀르 파보르', '부탁해요'],
    ['Café', '카페', '커피'],
    ['Agua', '아구아', '물'],
  ],
  travel: [
    ['Hola', '올라', '안녕하세요'],
    ['Por favor', '뽀르 파보르', '부탁합니다'],
    ['Gracias', '그라시아스', '감사합니다'],
    ['Un café', '운 카페', '커피 한 잔'],
    ['¿Dónde está?', '돈데 에스따', '어디에 있나요?'],
    ['La estación', '라 에스따시온', '기차역'],
  ],
  sounds: [
    ['Casa', '까사', '집'],
    ['Hola', '올라', '안녕'],
    ['Mesa', '메사', '탁자'],
    ['Gracias', '그라시아스', '고마워요'],
    ['Agua', '아구아', '물'],
    ['Niño', '니뇨', '아이'],
  ],
};

export const COURSE_QUIZZES = {
  daily: [
    ['뜻을 골라 보세요', 'Hola · 올라', ['안녕', '물'], 0, 'Hola는 편하게 건네는 인사예요.'],
    ['뜻을 골라 보세요', 'Buenos días · 부에노스 디아스', ['좋은 아침이에요', '고마워요'], 0, '아침에 만났을 때 쓰는 인사예요.'],
    ['뜻을 골라 보세요', 'Gracias · 그라시아스', ['부탁해요', '고마워요'], 1, 'Gracias는 고마워요라는 뜻이에요.'],
  ],
  travel: [
    ['뜻을 골라 보세요', 'Hola · 올라', ['안녕하세요', '기차역'], 0, 'Hola는 여행지에서도 자연스러운 첫 인사예요.'],
    ['뜻을 골라 보세요', 'Por favor · 뽀르 파보르', ['부탁합니다', '좋은 아침이에요'], 0, '부탁할 때 문장 끝에 자주 붙여요.'],
    ['뜻을 골라 보세요', '¿Dónde está? · 돈데 에스따', ['얼마예요?', '어디에 있나요?'], 1, '장소를 물어볼 때 쓰는 표현이에요.'],
  ],
  sounds: [
    ['뜻을 골라 보세요', 'Casa · 까사', ['집', '물'], 0, 'a는 입을 열어 짧고 분명하게 소리 내요.'],
    ['뜻을 골라 보세요', 'Hola · 올라', ['안녕', '탁자'], 0, '단어 안의 h는 소리 내지 않아요.'],
    ['뜻을 골라 보세요', 'Niño · 니뇨', ['고마워요', '아이'], 1, 'ñ는 “냐”처럼 부드럽게 이어 말해요.'],
  ],
};

export const DAILY_GOALS = [5, 10, 15];

export function getCourse(courseId) {
  return COURSE_CATALOG.find((course) => course.id === courseId) || COURSE_CATALOG[0];
}
