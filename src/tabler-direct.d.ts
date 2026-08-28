declare module "@tabler/icons-react/dist/esm/icons/*.mjs" {
  import type { ComponentType, SVGProps } from "react";
  const component: ComponentType<
    Omit<SVGProps<SVGSVGElement>, "stroke"> & {
      size?: number;
      stroke?: number;
    }
  >;
  export default component;
}
