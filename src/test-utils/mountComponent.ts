import { createApp, type App, type Component } from 'vue';

type MountedComponent = {
  app: App;
  root: HTMLElement;
};

function mountComponent(component: Component, props: Record<string, unknown> = {}): MountedComponent {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(component, props);
  app.mount(root);
  return { app, root };
}

function unmountComponent({ app, root }: MountedComponent): void {
  app.unmount();
  root.remove();
}

export function createMountRegistry() {
  const mounted: MountedComponent[] = [];

  return {
    mount(component: Component, props: Record<string, unknown> = {}): MountedComponent {
      const instance = mountComponent(component, props);
      mounted.push(instance);
      return instance;
    },
    cleanup(): void {
      mounted.splice(0).reverse().forEach(unmountComponent);
    }
  };
}
