/**
 * Command Registry — centralized command registration system.
 * Static commands (navigation, actions) are registered here.
 * Dynamic commands (tasks) are still built in CommandPalette.
 */

export interface CommandDefinition {
  id: string;
  label: string;
  description?: string;
  category: 'navigation' | 'action' | 'task' | 'status';
  keywords: string[];
  /** Icon is provided at render time by the component */
  iconKey?: string;
}

export interface RegisteredCommand extends CommandDefinition {
  action: () => void;
}

class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>();
  private listeners = new Set<() => void>();

  /** Register a command (or overwrite existing) */
  register(cmd: RegisteredCommand): void {
    this.commands.set(cmd.id, cmd);
    this.notify();
  }

  /** Register multiple commands at once */
  registerAll(cmds: RegisteredCommand[]): void {
    cmds.forEach(cmd => this.commands.set(cmd.id, cmd));
    this.notify();
  }

  /** Unregister a command by id */
  unregister(id: string): void {
    this.commands.delete(id);
    this.notify();
  }

  /** Get all registered commands */
  getAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  /** Search commands by query string */
  search(query: string): RegisteredCommand[] {
    if (!query.trim()) return this.getAll();
    const q = query.toLowerCase();
    return this.getAll().filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.keywords.some(kw => kw.toLowerCase().includes(q))
    );
  }

  /** Get a command by id */
  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id);
  }

  /** Subscribe to registry changes */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  /** Clear all commands */
  clear(): void {
    this.commands.clear();
    this.notify();
  }
}

// Singleton instance
export const commandRegistry = new CommandRegistry();
