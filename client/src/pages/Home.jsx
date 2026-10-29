import { useAuth } from '../context/useAuth';
import OfficerHome from './OfficerHome';
import SupervisorHome from './SupervisorHome';
import HeadOfficeHome from './HeadOfficeHome';
import InstitutionHome from './InstitutionHome';

const HOMES = {
  OFFICER: OfficerHome,
  SUPERVISOR: SupervisorHome,
  HEAD_OFFICE: HeadOfficeHome,
  INSTITUTION: InstitutionHome,
};

export default function Home() {
  const { user } = useAuth();
  const Page = HOMES[user.role];
  return Page ? <Page /> : null;
}