import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "선비북스 클라우드 대시보드",
    short_name: "선비북스 클라우드",
    description: "전자책 제작·검수·유통 대시보드",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f5f2",
    theme_color: "#17251f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
  };
}
