import type {
  BasePoint,
  Line,
  SequenceItem,
  Settings,
  StartPose,
} from "../../types";
import { calculatePathTime } from "../../utils/timeCalculator";
import { pathStem } from "../../utils/filename";

export const GIF_EXPORT_SCALE = 0.65;
export const GIF_EXPORT_FPS = 20;
export const GIF_EXPORT_QUALITY = 15;

export function createImageLoader() {
  const imageCache = new Map<string, HTMLImageElement>();

  return function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const cached = imageCache.get(src);
      if (cached) {
        resolve(cached);
        return;
      }
      const image = new Image();
      image.onload = () => {
        imageCache.set(src, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });
  };
}

export interface GifDurationInputs {
  hasActivePaths: boolean;
  hasDualPath: boolean;
  additionalPaths: {
    startPoint: StartPose | null;
    lines: Line[];
    settings: Settings;
    sequence: SequenceItem[];
  }[];
  startPoint: StartPose;
  lines: Line[];
  sequence: SequenceItem[];
  settings: Settings;
  secondStartPoint: StartPose | null;
  secondLines: Line[];
  secondSequence: SequenceItem[];
}

/** Total animation seconds to capture, taking the longest path in multi modes. */
export function computeGifDuration(input: GifDurationInputs): number {
  if (input.hasActivePaths) {
    return input.additionalPaths.reduce((longest, pathData) => {
      if (!pathData.startPoint) return longest;
      const pathTime = calculatePathTime(
        pathData.startPoint,
        pathData.lines,
        pathData.settings,
        pathData.sequence,
      );
      return Math.max(longest, pathTime?.totalTime || 0);
    }, 0);
  }

  if (input.hasDualPath) {
    const path1Time = calculatePathTime(
      input.startPoint,
      input.lines,
      input.settings,
      input.sequence,
    );
    const path2Time = input.secondStartPoint
      ? calculatePathTime(
          input.secondStartPoint,
          input.secondLines,
          input.settings,
          input.secondSequence,
        )
      : { totalTime: 0 };
    return Math.max(path1Time?.totalTime || 0, path2Time?.totalTime || 0);
  }

  const pathTime = calculatePathTime(
    input.startPoint,
    input.lines,
    input.settings,
    input.sequence,
  );
  return pathTime?.totalTime || 0;
}

export function createRobotDrawer(
  robotImage: HTMLImageElement,
  robotPixelWidth: number,
  robotPixelHeight: number,
  scale = GIF_EXPORT_SCALE,
) {
  return function drawRobot(
    ctx: CanvasRenderingContext2D,
    xy: BasePoint,
    headingDeg: number,
    opacity = 1,
  ) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(xy.x * scale, xy.y * scale);
    ctx.rotate((headingDeg * Math.PI) / 180);
    ctx.drawImage(
      robotImage,
      (-robotPixelWidth * scale) / 2,
      (-robotPixelHeight * scale) / 2,
      robotPixelWidth * scale,
      robotPixelHeight * scale,
    );
    ctx.restore();
  };
}

export function resolveGifFileName(
  currentFilePath: string | null,
  hasActivePaths: boolean,
  hasDualPath: boolean,
): string {
  if (currentFilePath) return pathStem(currentFilePath);
  if (hasActivePaths) return "multiple_paths";
  if (hasDualPath) return "dual_path";
  return "path_animation";
}

/** Frame capture occupies the first half of the progress bar, encoding the second. */
export function formatGifProgressStatus(progress: number): string {
  return progress < 0.5
    ? `Capturing frames... ${Math.round(progress * 200)}%`
    : `Encoding GIF... ${Math.round((progress - 0.5) * 200)}%`;
}
