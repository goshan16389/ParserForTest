let testData = [];
let qAmount = 0;
let htmlTest = '';

// Глобальные переменные
let currentSession = null;
let allSessions = [];

// Ключи для localStorage
const SESSIONS_KEY = 'test_sessions_history';

const wrongList = document.querySelector('.wrong-list');

async function processFile(content) {

    updateTotalResult("clear");

    qAmount = 0;

    const fileInputDocx = document.getElementById('docxFile');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');

    errorDiv.textContent = '';
    errorDiv.classList.add("hidden");
    loadingDiv.style.display = 'block';

    if (content === undefined) {

        loadingDiv.textContent = 'Читаю файл... ⏳';

        if (!fileInputDocx.files.length) {
            errorDiv.textContent = 'Пожалуйста, выберите файл';
            errorDiv.classList.remove("hidden");
            loadingDiv.style.display = 'none';
            return;
        }

        const file = fileInputDocx.files[0];

        try {
            const arrayBuffer = await file.arrayBuffer();

            // Конвертируем DOCX в HTML с изображениями
            const result = await mammoth.convertToHtml(
                { arrayBuffer },
                {
                    convertImage: mammoth.images.imgElement(function (image) {
                        return image.read("base64").then(function (imageBuffer) {
                            return {
                                src: "data:" + image.contentType + ";base64," + imageBuffer
                            };
                        });
                    })
                }
            );

            htmlTest = result.value;

        } catch (error) {
            errorDiv.textContent = 'Ошибка при обработке файла';
            errorDiv.classList.remove("hidden");
            loadingDiv.style.display = 'none';
            console.error('Error:', error);
        }

    } else if (content === "web") {

        loadingDiv.textContent = 'Ищу на сервере... ⏳';

        try {
            // Путь к файлу относительно корня сайта
            const response = await fetch('/docNormalized.docx');

            if (!response.ok) {
                throw new Error('Файл не найден');
            }

            // Получаем файл как ArrayBuffer
            const arrayBuffer = await response.arrayBuffer();
            console.log('Файл загружен, размер:', arrayBuffer.byteLength, 'байт');

            const result = await mammoth.convertToHtml(
                { arrayBuffer },
                {
                    convertImage: mammoth.images.imgElement(function (image) {
                        return image.read("base64").then(function (imageBuffer) {
                            return {
                                src: "data:" + image.contentType + ";base64," + imageBuffer
                            };
                        });
                    })
                }
            );

            htmlTest = result.value;

        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            return null;
        }

    }
    else {
        htmlTest = content;
    }

    // Парсим вопросы
    testData = parseQuestions(htmlTest);

    if (testData.length === 0) {
        errorDiv.textContent = 'Не удалось найти вопросы в файле.';
        errorDiv.classList.remove("hidden");
        loadingDiv.style.display = 'none';
        return;
    }

    const shuffler = document.getElementById('shuffle');
    if (shuffler.classList.contains('loaded')) {
        testData = shuffleArray(testData);
    }


    displayTest(testData);
    displayGroupSelector(); // показываем селектор групп
    loadingDiv.style.display = 'none';

    startNewSession();


}

function parseQuestions(htmlContent) {
    const questions = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const elements = Array.from(tempDiv.children);
    let currentQuestion = null;
    let currentGroup = "Общие вопросы"; // группа по умолчанию

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent.trim();

        if (!text && tagName !== 'img') continue;

        // Определяем заголовки групп
        if (tagName === 'p' && (element.innerHTML.includes('ТЕМА'))) {
            currentGroup = text;
            continue;
        }

        // Ищем начало вопроса
        if (tagName === 'p' && text && !text.match(/^[1-4][\.\)]\s/)) {
            if (currentQuestion && currentQuestion.options.length > 0) {
                questions.push(currentQuestion);
            }

            currentQuestion = {
                question: text,
                options: [],
                correctAnswer: null,
                image: null,
                group: currentGroup // сохраняем группу
            };

            const img = element.querySelector('img');
            if (img && img.src) {
                currentQuestion.image = img.src;
            }
        }
        // Ищем нумерованный список с вариантами ответов
        else if (tagName === 'ol' && currentQuestion) {
            const listItems = element.querySelectorAll('li');
            const options = [];
            let correctIndex = null;

            // Сначала собираем все варианты и находим правильный
            listItems.forEach((li, index) => {
                let optionText = li.textContent.trim();
                let isCorrect = false;
                let multiVals = null;


                if (optionText.includes('multi-')) {
                    const multiRes = optionText.split('multi-')[1].trim();

                    if (multiRes === "all") {
                        multiVals = ["all"];
                    } else {

                        multiVals = multiRes.match(/\d+/g); // Преобразуем в числа
                    }

                    optionText = optionText.split('multi')[0].trim();
                }

                // Проверяем правильный ответ (с |1 в конце)
                if (optionText.includes('|1')) {
                    optionText = optionText.split('|1')[0].trim();
                    //optionText = optionText.replace(/\|1.*$/, '').trim();
                    isCorrect = true;
                    correctIndex = index;
                }

                // Добавляем номер варианта к тексту
                //optionText = `${index + 1}. ${optionText}`;

                options.push({
                    text: optionText,
                    originalIndex: index,
                    isCorrect: isCorrect,
                    multiVals: multiVals
                });
            });


            // Перемешиваем варианты ответов
            const shuffledOptions = shuffleArray(options);
            //console.log(shuffledOptions);

            currentQuestion._originalOptions = options;

            // Разделяем варианты на три группы
            const normalOptions = [];
            const multiOptions = [];
            const allOptions = [];

            // Сначала распределяем варианты по группам
            shuffledOptions.forEach((option) => {
                if (option.multiVals != null) {
                    if (option.multiVals[0] === "all") {
                        allOptions.push(option);
                    } else {
                        multiOptions.push(option);
                    }
                } else {
                    normalOptions.push(option);
                }
            });

            // Собираем в правильном порядке: обычные -> multi -> all
            const finalOptions = [...normalOptions, ...multiOptions, ...allOptions];

            // Обрабатываем multiOptions и находим правильный ответ
            let newCorrectIndex = null;

            finalOptions.forEach((option, finalIndex) => {
                // Обрабатываем multi варианты (замена индексов)
                if (option.multiVals != null && option.multiVals[0] !== "all") {
                    const valsArr = option.multiVals[0].split("");

                    // Получаем все новые числа
                    const newNumbers = [];
                    valsArr.forEach(element => {
                        const originalElement = options[parseInt(element) - 1];
                        if (originalElement) {
                            const newPosition = finalOptions.findIndex(opt => opt === originalElement);
                            newNumbers.push(newPosition + 1);
                        }
                    });

                    // Сортируем числа по возрастанию
                    newNumbers.sort((a, b) => a - b);

                    // Находим все числа в тексте и заменяем их по порядку
                    let numbersInText = option.text.match(/\d+/g) || [];
                    if (numbersInText.length === newNumbers.length) {
                        let newText = option.text;
                        numbersInText.forEach((num, index) => {
                            newText = newText.replace(num, newNumbers[index].toString());
                        });
                        option.text = newText;
                    }
                }

                // Добавляем в вопрос
                currentQuestion.options.push(option.text);

                // Запоминаем индекс правильного ответа
                if (option.isCorrect) {
                    newCorrectIndex = finalIndex;
                }
            });

            // Сохраняем новый индекс правильного ответа
            if (newCorrectIndex !== null) {
                currentQuestion.correctAnswer = newCorrectIndex;
            }

            // Сохраняем оригинальные данные для отладки

            currentQuestion._originalCorrect = correctIndex;
            currentQuestion._shuffledCorrect = newCorrectIndex;
        }
        // Ищем отдельные изображения (могут быть между вопросом и списком)
        else if (tagName === 'img' && currentQuestion && currentQuestion.options.length === 0) {
            currentQuestion.image = element.src;
        }
        // Продолжение текста вопроса
        else if (tagName === 'p' && currentQuestion && currentQuestion.options.length === 0 && text) {
            currentQuestion.question += ' ' + text;
        }
    }

    // Добавляем последний вопрос
    if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
    }

    return questions;
}

function displayTest(questions) {
    const questionsContainer = document.getElementById('questions');
    const testContainer = document.getElementById('testContainer');

    questionsContainer.innerHTML = '';

    // Сохраняем все вопросы
    window.allQuestions = questions;

    // Показываем все вопросы по умолчанию
    window.currentQuestions = questions;

    questions.forEach((q, qIndex) => {
        qAmount += 1;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.id = `question-${qIndex}`;
        questionDiv.dataset.group = q.group; // сохраняем группу в data-атрибут

        let questionHTML = `
            <div class="question-header">
                <div class="question-number">${qIndex + 1}</div>
                <div class="question-text">${q.question}</div>
            </div>
        `;

        if (q.image) {
            questionHTML += `<img src="${q.image}" class="question-image" alt="Изображение к вопросу">`;
        }

        questionHTML += `<div class="options">`;

        q.options.forEach((option, oIndex) => {
            questionHTML += `
                <div class="option" onclick="selectOption(${qIndex}, ${oIndex})">
                    
                        <p id="q${qIndex}o${oIndex}">${oIndex + 1}. ${option}</p>
                    
                </div>
            `;
        });

        questionHTML += `</div>`;
        questionDiv.innerHTML = questionHTML;
        questionsContainer.appendChild(questionDiv);
    });

    testContainer.style.display = 'block';
    window.scrollTo(0, 0);

    const remainsP = document.getElementById('remainsAmount');
    remainsP.textContent = qAmount;
}

function selectOption(questionIndex, optionIndex, event) {
    if (event) event.stopPropagation();
    //const question = window.currentQuestions[questionIndex];
    checkAnswer(questionIndex, optionIndex);
    //question.userAnswer = optionIndex;
}

function checkAnswer(questionIndex, selectedOptionIndex) {
    const question = testData[questionIndex];
    const optionDiv = document.querySelector(`#q${questionIndex}o${selectedOptionIndex}`).closest('.option');
    const allOptions = document.querySelectorAll(`#question-${questionIndex} .option`);

    const questionNumber = document.querySelector(`#question-${questionIndex} .question-number`);



    // Проверяем ответ
    const isCorrect = selectedOptionIndex === question.correctAnswer;

    // Логируем результат
    if (isCorrect) {
        logCorrectAnswer(questionIndex);
        const question = document.getElementById(`question-${questionIndex}`);
        scrollToNextVisibleQuestion("next", question);
    } else {
        logError(questionIndex);
    }

    // Применяем стили
    if (isCorrect) {
        if (!optionDiv.classList.contains('correct')) {
            if (optionDiv.parentElement.classList.contains('wasincorrect')) {
                optionDiv.parentElement.classList.remove('wasincorrect');
                updateTotalResult("--");
            }
            optionDiv.classList.add('correct');
            updateTotalResult("+");
            optionDiv.parentElement.classList.add('wascorrect');

            if (!questionNumber.classList.contains('red')) {
                questionNumber.classList.add('green');
            }
        }
    } else {
        const parent = optionDiv.parentElement;
        if (optionDiv.parentElement.classList.contains('wascorrect')) {
            optionDiv.parentElement.classList.remove('wascorrect');
            updateTotalResult("-+");
            //return;
            //раскоментить return, Закоментить строки выше для запрета перевыбора после правильного
        }
        const children = Array.from(parent.children);
        const hasIncorrectChild = children.some(child =>
            child.classList.contains('incorrect')
        );
        if (hasIncorrectChild) {
            optionDiv.classList.add('incorrect');
        } else if (!optionDiv.classList.contains('incorrect')) {
            optionDiv.classList.add('incorrect');
            updateTotalResult("-");

            if (!document.getElementById(`wrong-${questionIndex}`)) {
                const questionNumber = question.question.split(' ')[0];
                wrongList.innerHTML += `<span id="wrong-${questionIndex}" class="wrong-q">${questionNumber}</span>`;
            }
        }
        parent.classList.add('wasincorrect');

        if (!questionNumber.classList.contains('red')) {
            questionNumber.classList.add('red');
        }
    }

    // Сбрасываем стили всех вариантов
    allOptions.forEach(opt => {
        if (opt !== optionDiv) {
            opt.classList.remove('correct', 'incorrect');
        }
    });
}

function updateTotalResult(operation) {
    const remainsP = document.getElementById('remainsAmount');
    const correctP = document.getElementById('correctAmount');
    const incorrectP = document.getElementById('incorrectAmount');

    if (operation == "+") {
        correctP.textContent = Number(correctP.textContent) + 1;
        remainsP.textContent = Number(remainsP.textContent) - 1; // уменьшаем оставшиеся
    } else if (operation == "-") {
        incorrectP.textContent = Number(incorrectP.textContent) + 1;
        remainsP.textContent = Number(remainsP.textContent) - 1; // уменьшаем оставшиеся
    } else if (operation == "clear") {
        correctP.textContent = 0;
        incorrectP.textContent = 0;
        remainsP.textContent = qAmount;

        // Завершаем текущую сессию
        endSession();

    } else if (operation == "-+") {
        correctP.textContent = Number(correctP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    } else if (operation == "--") {
        incorrectP.textContent = Number(incorrectP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    }
}

function resetTest() {
    // Сбрасываем все выборы
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });

    // Сбрасываем стили
    document.querySelectorAll('.option').forEach(option => {
        option.classList.remove('correct', 'incorrect');
    });

    document.querySelectorAll('.wascorrect').forEach(el => {
        el.classList.remove("wascorrect")
    })

    document.querySelectorAll('.wasincorrect').forEach(el => {
        el.classList.remove("wasincorrect")
    })

    document.querySelectorAll('.question-number').forEach(el => {
        el.classList.remove("green")
        el.classList.remove("red")
    })

    document.querySelector('.wrong-list').innerHTML = '';

    // Сбрасываем общий результат
    updateTotalResult("clear");
    scrollToTopBtn.click();
}

// Функция для перемешивания массива (алгоритм Фишера-Йейтса)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Добавляем newIndex каждому элементу
    shuffled.forEach((item, index) => {
        item.newIndex = index;
    });

    return shuffled;
}

function filterQuestionsByGroup(groupName) {
    const questionsContainer = document.getElementById('questions');
    const allQuestionDivs = questionsContainer.querySelectorAll('.question');

    allQuestionDivs.forEach(div => {
        if (groupName === 'all') {
            div.style.display = 'block';
        } else if (groupName === 'with_images') {
            // Показываем только вопросы с картинками
            const hasImages = div.querySelector('img') !== null ||
                div.innerHTML.includes('data:image');
            div.style.display = hasImages ? 'block' : 'none';
        } else if (groupName === 'without_images') {
            // Показываем только вопросы без картинок
            const hasImages = div.querySelector('img') !== null ||
                div.innerHTML.includes('data:image');
            div.style.display = hasImages ? 'none' : 'block';
        } else {
            // Обычная фильтрация по группе
            div.style.display = div.dataset.group === groupName ? 'block' : 'none';
        }
    });

    // Обновляем текущие вопросы для проверки ответов
    if (groupName === 'all') {
        window.currentQuestions = window.allQuestions;
    } else if (groupName === 'with_images') {
        window.currentQuestions = window.allQuestions.filter(hasQuestionImages);
    } else if (groupName === 'without_images') {
        window.currentQuestions = window.allQuestions.filter(q => !hasQuestionImages(q));
    } else {
        window.currentQuestions = window.allQuestions.filter(q => q.group === groupName);
    }

    // Сбрасываем результаты
    // document.getElementById('results').style.display = 'none';
}

// Функция проверки наличия картинок в вопросе
function hasQuestionImages(question) {
    // Проверяем вопрос
    const questionHasImages = question.question.includes('<img') ||
        question.question.includes('data:image') ||
        question.question.includes('src=');

    // Проверяем варианты ответов
    const optionsHaveImages = question.options.some(option =>
        option.includes('<img') ||
        option.includes('data:image') ||
        option.includes('src=')
    );

    // Проверяем объяснение (если есть)
    const explanationHasImages = question.explanation &&
        (question.explanation.includes('<img') ||
            question.explanation.includes('data:image') ||
            question.explanation.includes('src='));

    return questionHasImages || optionsHaveImages || explanationHasImages;
}

function displayGroupSelector() {
    const groupSelector = document.getElementById('groupSelector');
    const groupSelect = document.createElement('select');
    groupSelect.classList.add('mySelect');

    // Подсчитываем вопросы с картинками по фактически отображенным элементам
    let withImagesCount = 0;
    let withoutImagesCount = 0;

    const questionsContainer = document.getElementById('questions');
    if (questionsContainer) {
        const questionElements = questionsContainer.querySelectorAll('.question');
        questionElements.forEach(div => {
            if (div.querySelector('img')) {
                withImagesCount++;
            } else {
                withoutImagesCount++;
            }
        });
    } else {
        // Fallback: используем фильтрацию по данным
        withImagesCount = window.allQuestions.filter(hasQuestionImages).length;
        withoutImagesCount = window.allQuestions.length - withImagesCount;
    }

    const totalQuestions = window.allQuestions.length;

    groupSelect.innerHTML = `
        <option value="all">Все вопросы (${totalQuestions})</option>
        <option value="with_images">🖼️ С картинками (${withImagesCount})</option>
        <option value="without_images">📝 Без картинок (${withoutImagesCount})</option>
    `;

    // Получаем уникальные группы и подсчитываем количество вопросов в каждой
    const groups = [...new Set(window.allQuestions.map(q => q.group))];
    const groupCounts = {};

    // Считаем вопросы по группам
    window.allQuestions.forEach(question => {
        if (question.group) {
            groupCounts[question.group] = (groupCounts[question.group] || 0) + 1;
        }
    });

    // Сортируем группы
    const sorted = groups.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

    // Добавляем обычные группы с количеством вопросов
    sorted.forEach(group => {
        if (group) {
            const count = groupCounts[group] || 0;
            groupSelect.innerHTML += `<option value="${group}">${group} (${count})</option>`;
        }
    });

    groupSelect.onchange = function () {
        filterQuestionsByGroup(this.value);
        if (typeof scrollToTopBtn !== 'undefined' && scrollToTopBtn) {
            scrollToTopBtn.click();
        }
    };

    groupSelector.innerHTML = '';
    groupSelector.appendChild(groupSelect);
    groupSelector.style.display = 'block';
}

// Получаем кнопку
const scrollToTopBtn = document.getElementById('scrollToTopBtn');

// Показываем/скрываем кнопку при скролле
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
});

// Плавная прокрутка вверх при клике
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});



// Работа с IndexedDB для больших объемов данных
class FileDB {
    constructor() {
        this.dbName = 'FilesDB';
        this.storeName = 'files';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async saveFile(filename, content) {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.put(content, filename);
        return new Promise((resolve) => {
            transaction.oncomplete = resolve;
        });
    }

    async loadFile(filename) {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(filename);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFile(filename) {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        const getRequest = store.get(filename);

        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                if (getRequest.result === undefined) {
                    infoDiv.textContent = "Кэш отсутствует! ✅";
                    resolve(); // просто резолвим без ошибки
                } else {
                    const deleteRequest = store.delete(filename);
                    deleteRequest.onsuccess = () => resolve();
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                    infoDiv.textContent = "Кэш очищен! ✅";
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}

const fileDB = new FileDB();

const toCacheButton = document.getElementById("toCache");
const fromCacheButton = document.getElementById("fromCache");
const fromServer = document.getElementById("fromServer");
const clearCacheButton = document.getElementById("clearCache");
const infoDiv = document.getElementById("loading")

toCacheButton.addEventListener("click", async function () {

    await fileDB.init();
    await fileDB.saveFile("questions.txt", htmlTest).then(() => console.log("Файл успешно сохранен."));

    const prevText = infoDiv.textContent;
    infoDiv.style.display = 'block';
    infoDiv.textContent = "Запись добавлена в кэш! ✅";
    setTimeout(() => {
        infoDiv.style.display = 'none';
    }, 1000);

});

clearCacheButton.addEventListener("click", async function () {

    await fileDB.init();

    const prevText = infoDiv.textContent;
    await fileDB.deleteFile("questions.txt");

    infoDiv.style.display = 'block';
    setTimeout(() => {
        infoDiv.textContent = prevText;
        if (prevText == "Читаю кэш... ⏳" || prevText == "Читаю файл... ⏳" || prevText == "Ищу на сервере... ⏳") infoDiv.style.display = 'none';
    }, 1000);

});

fromCacheButton.addEventListener("click", async function () {

    await fileDB.init();
    const content = await fileDB.loadFile("questions.txt");
    if (content) {

        infoDiv.style.display = 'block';
        infoDiv.textContent = 'Читаю кэш... ⏳'

        setTimeout(() => {
            processFile(content);
        }, 1000);

    } else {
        console.log("Файл не найден.");
        infoDiv.style.display = 'block';
        infoDiv.textContent = "Запись в кэше не найдена или пуста! ⚠️";
    }
});

fromServer.addEventListener("click", async function () {

    processFile("web");

});

async function checkCache(storeName, key) {
    try {
        // Убедимся, что база инициализирована
        if (!fileDB.db) {
            await fileDB.init();
        }

        const transaction = fileDB.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const value = request.result;

                // Множественные проверки на пустоту
                const isValid = (
                    value !== undefined &&
                    value !== null &&
                    value !== '' &&
                    !(typeof value === 'string' && value.trim() === '') &&
                    !(Array.isArray(value) && value.length === 0) &&
                    !(typeof value === 'object' && value && Object.keys(value).length === 0)
                );

                resolve({
                    exists: value !== undefined,
                    isValid: isValid,
                    value: value,
                    type: typeof value
                });
            };

            request.onerror = () => {
                console.error('Ошибка запроса:', request.error);
                reject(request.error);
            };
        });

    } catch (error) {
        console.error('Ошибка в checkCache:', error);
        return {
            exists: false,
            isValid: false,
            value: null,
            error: error.message
        };
    }
}

async function checkCacheOnLoad() {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.textContent = 'Читаю кэш... ⏳';
    loadingDiv.style.display = 'block';
    try {
        console.log('🔄 Начинаем проверку кэша...');

        const result = await checkCache('files', 'questions.txt');

        if (result.isValid) {
            console.log('✅ Файл существует и не пустой, загружаю...');
            fromCacheButton.click();

        } else if (result.exists) {
            console.log('⚠️ Файл существует, но пустой');
            loadingDiv.textContent = 'Запись в кэше некорректна, загрузите файл с сервера или ПК 📁';

        } else {
            console.log('❌ Файл не существует');
            loadingDiv.textContent = 'Запись в кэше отсутствует, загрузите файл с сервера или ПК 📁';
        }

    } catch (error) {
        console.error('❌ Ошибка при проверке кэша:', error);
    }
}




// Инициализация при загрузке страницы
function initSessions() {
    loadSessionsHistory();
}

// Загрузка истории сессий из localStorage
function loadSessionsHistory() {
    try {
        const savedSessions = localStorage.getItem(SESSIONS_KEY);
        if (savedSessions) {
            allSessions = JSON.parse(savedSessions);
        }
    } catch (error) {
        console.warn('Не удалось загрузить историю сессий:', error);
        allSessions = [];
    }
}

// Сохранение истории сессий в localStorage
function saveSessionsHistory() {
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(allSessions));
    } catch (error) {
        console.warn('Не удалось сохранить историю сессий:', error);
    }
}

// Начало новой сессии при загрузке теста
function startNewSession() {
    currentSession = {
        id: Date.now(),
        startTime: new Date().toLocaleString(),
        endTime: null,
        errors: [], // массив номеров вопросов с ошибками
        totalQuestions: qAmount,
        correctAnswers: 0,
        incorrectAnswers: 0
    };
}

// Завершение сессии при сбросе теста
function endSession() {
    if (!currentSession) return;

    if (currentSession.correctAnswers === 0 && currentSession.incorrectAnswers === 0) return;

    currentSession.endTime = new Date().toLocaleString();

    // Добавляем сессию в историю
    allSessions.push(currentSession);

    // Сохраняем историю
    saveSessionsHistory();

    // Сбрасываем текущую сессию
    currentSession = null;

    startNewSession();
}

// Получение статистики текущей сессии
function getCurrentSessionStats() {
    if (!currentSession) return null;

    return {
        totalQuestions: currentSession.totalQuestions,
        correctAnswers: currentSession.correctAnswers,
        incorrectAnswers: currentSession.incorrectAnswers,
        errorCount: currentSession.errors.length,
        isCompleted: currentSession.endTime !== null
    };
}

// Логирование ошибки
function logError(questionIndex) {
    if (!currentSession) return;

    // Проверяем, есть ли уже такая ошибка в сессии
    if (!currentSession.errors.includes(questionIndex)) {
        currentSession.errors.push(questionIndex);
        currentSession.incorrectAnswers++;
    }
}

// Логирование правильного ответа
function logCorrectAnswer(questionIndex) {
    if (!currentSession) return;

    // Проверяем, есть ли уже такая ошибка в сессии
    if (!currentSession.errors.includes(questionIndex)) {
        currentSession.correctAnswers++;
    }
}

// Сохранение сессии перед закрытием/перезагрузкой
window.addEventListener('beforeunload', function (event) {
    if (currentSession) {
        endSession();
    }
});

// При загрузке страницы
document.addEventListener('DOMContentLoaded', function () {
    checkCacheOnLoad();
    initSessions();
});


document.getElementById('docxFile').addEventListener('change', function (e) {
    const fileButton = this.parentElement;
    const buttonText = fileButton.querySelector('.file-button-text');
    const img = document.getElementById("processDocx");

    if (this.files.length > 0) {
        const fileName = this.files[0].name;

        // Обрезаем длинное имя файла
        const displayName = fileName.length > 20
            ? fileName.substring(0, 17) + '...'
            : fileName;

        buttonText.textContent = `📄 ${displayName}`;
        buttonText.classList.add('has-file');
        img.classList.add('loaded');


    } else {
        buttonText.textContent = '📄 Выбрать DOCX файл';
        buttonText.classList.remove('has-file');
    }
});

document.getElementById('shuffle').addEventListener('click', function () {
    if (this.classList.contains('loaded')) {
        this.classList.remove('loaded');
    } else {
        this.classList.add('loaded');
    }
})

const tooltip = document.getElementById(`global-tooltip`);
const images = document.querySelectorAll(`.top-btn`);

// Добавляем обработчики для каждой картинки
images.forEach(img => {
    img.addEventListener('mouseover', (event) => {
        const rect = img.getBoundingClientRect();

        tooltip.textContent = img.alt;
        tooltip.style.left = (rect.right + window.scrollX) + 'px';
        tooltip.style.top = (rect.bottom + window.scrollY) + 'px';
        tooltip.style.opacity = '1';
    });

    img.addEventListener('mouseout', () => {
        tooltip.style.opacity = '0';
    });
});


wrongList.addEventListener('wheel', (e) => {
    e.preventDefault();
    wrongList.scrollLeft += e.deltaY * 3;
});

// Вешаем обработчик на родительский элемент
wrongList.addEventListener('click', function (event) {
    // Проверяем, что кликнули по элементу с классом wrong-q
    if (event.target.classList.contains('wrong-q')) {
        const number = event.target.id.split('-')[1];
        const question = document.getElementById(`question-${number}`);
        
        scrollToNextVisibleQuestion("cur", question);
        // Ваша логика здесь
    }
});

function scrollToNextVisibleQuestion(mode, currentElement, offset = 80) {
    let next = currentElement;
    if (mode != "cur") {
        next = currentElement.nextElementSibling;
    }

    while (next) {
        if (next.id && next.id.startsWith('question-')) {
            const style = window.getComputedStyle(next);
            if (style.display !== 'none' && style.visibility !== 'hidden' && next.offsetParent !== null) {
                // Скроллим с учётом отступа
                const elementTop = next.getBoundingClientRect().top + window.pageYOffset;
                const scrollToPosition = elementTop - offset;

                window.scrollTo({
                    top: scrollToPosition,
                    behavior: 'smooth'
                });

                return;
            }
        }
        next = next.nextElementSibling;
    }

    console.log('Следующего видимого вопроса ниже нет');
}