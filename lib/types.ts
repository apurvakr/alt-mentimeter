export type SlideType =
  | "multiple_choice"
  | "word_cloud"
  | "open_ended"
  | "scales"
  | "quiz_select"
  | "quiz_type";

/** "self": everyone gets every question at once; "presenter": one question at a time, moved on by the presenter. */
export type Pacing = "presenter" | "self";

export type SessionStatus = "draft" | "open" | "closed";

export interface SlideSettings {
  /** quiz_select: index of the right option */
  correctIndex?: number;
  /** quiz_type: answers that count as correct, compared case-insensitively */
  acceptedAnswers?: string[];
  /** quizzes: seconds participants get to answer (presenter-paced only) */
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
  pacing: Pacing;
  status: SessionStatus;
  showResults: boolean;
}

export interface QuizWindow {
  startedAt: number;
  endsAt: number;
}

export interface QuizOutcome {
  correct: boolean;
  points: number;
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
  /** phones connected right now */
  participants: number;
  /** people who answered at least one question, and those who answered all of them */
  progress: { started: number; completed: number };
  /** different people who answered each slide, by slide id */
  respondents: Record<string, number>;
  joinUrl: string;
  joinHost: string;
  serverNow: number;
}

export type PresentationSummary =
  | { id: string; missing: true }
  | {
      id: string;
      missing?: false;
      title: string;
      code: string;
      status: SessionStatus;
      pacing: Pacing;
      slides: number;
      started: number;
    };

/** A slide as participants see it: the answer key is stripped. */
export type PublicSlide = Omit<Slide, "settings"> & {
  settings: Omit<SlideSettings, "correctIndex" | "acceptedAnswers">;
};

export interface AudienceState {
  title: string;
  status: SessionStatus;
  pacing: Pacing;
  /** every question in a self-paced survey; only the current one when the presenter sets the pace */
  slides: PublicSlide[];
  /** position of the current question in the deck (presenter-paced) */
  currentIndex: number;
  total: number;
  /** how many responses this participant has given, by slide id */
  mine: Record<string, number>;
  quiz: Record<string, QuizWindow>;
  quizResults: Record<string, QuizOutcome>;
  name: string | null;
  serverNow: number;
}
