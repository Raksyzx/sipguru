import { useLayoutEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import TeacherNavigation from "./TeacherNavigation";

const TeacherLayout = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <>
      <div key={pathname} className="teacher-page-transition">
        <Outlet />
      </div>
      <TeacherNavigation />
    </>
  );
};

export default TeacherLayout;
