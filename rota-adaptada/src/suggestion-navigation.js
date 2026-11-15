// Keep native touch scrolling and keyboard focus; arrows reflect the visible range.
export function mountSuggestionNavigation(root) {
  mountSuggestionNavigation.cleanup?.();
  const rail = root.querySelector('.suggestion-carousel');
  if (!rail) return;
  const cards = [...rail.querySelectorAll('.suggestion-option')];
  const buttons = [...root.querySelectorAll('[data-suggestion-direction]')];
  const update = () => {
    const end = rail.scrollWidth - rail.clientWidth;
    buttons.forEach(button => {
      button.hidden = end < 2;
      button.disabled = Number(button.dataset.suggestionDirection) < 0
        ? rail.scrollLeft < 2 : rail.scrollLeft >= end - 2;
    });
  };
  const move = direction => {
    const width = cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : rail.clientWidth;
    rail.scrollBy({left: direction * width, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  };
  buttons.forEach(button => button.onclick = () => move(Number(button.dataset.suggestionDirection)));
  rail.onkeydown = event => {
    if (event.target !== rail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key.startsWith('Arrow')) move(event.key === 'ArrowLeft' ? -1 : 1);
    else rail.scrollTo({left: event.key === 'Home' ? 0 : rail.scrollWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  };
  rail.onscroll = update;
  // The next mount disconnects this observer, including when the cards disappear.
  const observer = new ResizeObserver(update);
  observer.observe(rail);
  mountSuggestionNavigation.cleanup = () => observer.disconnect();
  update();
}
