export default function ImageLightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div className="image-lightbox" onClick={onClose}>
      <img src={url} alt="Enlarged preview" />
    </div>
  );
}
