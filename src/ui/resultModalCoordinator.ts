export interface ResultModalSession {
  closed: Promise<void>;
  dismiss(): void;
}

export class ResultModalCoordinator {
  private dismissCurrent: (() => void) | null = null;

  replace(cleanup: () => void): ResultModalSession {
    this.dismiss();

    let resolveClosed: () => void = () => {};
    let settled = false;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const dismiss = (): void => {
      if (settled) return;
      settled = true;
      if (this.dismissCurrent === dismiss) this.dismissCurrent = null;
      cleanup();
      resolveClosed();
    };

    this.dismissCurrent = dismiss;
    return { closed, dismiss };
  }

  dismiss(): void {
    this.dismissCurrent?.();
  }
}
