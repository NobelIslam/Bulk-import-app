import {
  ButtonIcon,
  CalendarIcon,
  CheckboxIcon,
  EmailIcon,
  EyeCheckMarkIcon,
  HashtagIcon,
  MobileIcon,
  SelectIcon,
  ShieldCheckMarkIcon,
  TextBlockIcon,
  TextIcon,
  TextTitleIcon,
  UploadIcon,
} from "@shopify/polaris-icons";

// Maps the `icon` key on a field type in ./fields.js to a Polaris icon.
const ICONS = {
  text: TextIcon,
  textLong: TextBlockIcon,
  email: EmailIcon,
  mobile: MobileIcon,
  hash: HashtagIcon,
  calendar: CalendarIcon,
  upload: UploadIcon,
  eye: EyeCheckMarkIcon,
  list: SelectIcon,
  select: SelectIcon,
  checkbox: CheckboxIcon,
  checkboxGroup: CheckboxIcon,
  shield: ShieldCheckMarkIcon,
  heading: TextTitleIcon,
  paragraph: TextBlockIcon,
  button: ButtonIcon,
};

export default function FieldIcon({ name, color, size = 20 }) {
  const Icon = ICONS[name] || TextIcon;
  return <Icon color={color} size={size} />;
}