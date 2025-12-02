/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './public/**/*.html',
        './public/**/*.js',
    ],
    safelist: [
        'bg-red-600',
        'hover:bg-red-700',
        'text-red-600',
        'text-green-600',
        'bg-amber-600',
        'hover:bg-amber-700',
        'text-indigo-600'
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
