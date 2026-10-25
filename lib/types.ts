export type SlideType =
  | "multiple_choice"
  | "word_cloud"
  | "open_ended"
  | "scales"
  | "quiz_select"
  | "quiz_type";

export interface SlideSettings {
  /** quiz_select: index of the right option */
  correctIndex?: number;
  /** quiz_type: answers that count as correct, compared case-insensitively */
  acceptedAnswers?: string[];
  /** quizzes: seconds participants get to answer */
  timeLimit?: number;
  /** word_cloud / open_ended: submissions allowed per participant */
  maxEntries?: number;
  /** scales: ratings run from 1 to scaleMax */
  scaleMax?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface Slide {
  id: string;
  type: SlideType;
  question: string;
  /** choices for multiple choice / quiz_select, statements for scales */
  options: string[];
  settings: SlideSettings;
}

export interface Presentation {
  id: string;
  title: string;
  code: string;
  currentIndex: number;
  slides: Slide[];
}

export interface QuizWindow {
  startedAt: number;
  endsAt: number;
}

export type Results =
  | { kind: "choices"; counts: number[]; total: number }
  | { kind: "words"; words: { text: string; count: number }[]; total: number }
  | { kind: "texts"; entries: { id: number; text: string }[]; total: number }
  | { kind: "scales"; averages: (number | null)[]; total: number }
  | { kind: "quizText"; correct: number; answers: { text: string; count: number }[]; total: number };

export interface LeaderboardEntry {
  name: string;
  score: number;
}

export interface HostState {
  presentation: Presentation;
  results: Record<string, Results>;
  quiz: Record<string, QuizWindow>;
  leaderboard: LeaderboardEntry[];
  participants: number;
  joinUrl: string;
  joinHost: string;
  serverNow: number;
}

/** A slide as participants see it: the answer key is stripped. */
export type PublicSlide = Omit<Slide, "settings"> & {
  settings: Omit<SlideSettings, "correctIndex" | "acceptedAnswers">;
};

export interface AudienceState {
  title: string;
  index: number;
  total: number;
  slide: PublicSlide | null;
  /** responses this participant has already given to the current slide */
  mine: number;
  quiz: QuizWindow | null;
  quizResult: { correct: boolean; points: number } | null;
  name: string | null;
  serverNow: number;
}
