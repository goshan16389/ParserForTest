let testData = [];
let qAmount = 0;
let htmlTest = '';
const reallyAllQuestions = [];

let selectedVersion = null;

// Глобальные переменные
let currentSession = null;

const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);

// Ключи для localStorage
const SESSION_KEY = 'test_session';

const wrongList = document.querySelector('.wrong-list');

async function processFile(content, version) {

    const loadingDiv = document.getElementById('loading');

    if (content === "web" && version == "my-file") {
        loadingDiv.textContent = "Выберите файл из хранящихся на сервере! ⚠️"
        return;
    };
    updateTotalResult("clear");
    qAmount = 0;

    const fileInputDocx = document.getElementById('docxFile');
    const errorDiv = document.getElementById('error');

    errorDiv.textContent = '';
    errorDiv.classList.add("hidden");
    loadingDiv.style.display = 'block';

    if (content === undefined) {
        resetTest();
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
            const response = await fetch(`/${version}.docx`);
            console.log(response);
            if (!response.ok) {
                loadingDiv.textContent = 'Файл не найден! ⚠️';
                return;
            }
            const arrayBuffer = await response.arrayBuffer();
            console.log('Файл загружен, размер:', arrayBuffer.byteLength, 'байт');
            loadingDiv.textContent = 'Файл загружен! Читаю... ⏳';
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
    } else {
        htmlTest = content;
    }

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
    displayGroupSelector();
    loadingDiv.style.display = 'none';
    startNewSession();
}

function parseQuestions(htmlContent) {
    const questions = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const elements = Array.from(tempDiv.children);
    let currentQuestion = null;
    let currentGroup = "Общие вопросы";

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent.trim();

        if (!text && tagName !== 'img') continue;

        if (tagName === 'p' && (element.innerHTML.includes('ТЕМА'))) {
            if (isMobile) currentGroup = text.match(/ТЕМА\s+\d+/)[0];
            else currentGroup = text;
            continue;
        }

        if (tagName === 'p' && text && !text.match(/^[1-4][\.\)]\s/)) {
            if (currentQuestion && currentQuestion.options.length > 0) {
                questions.push(currentQuestion);
                reallyAllQuestions.push(currentQuestion);
            }
            currentQuestion = {
                question: text,
                options: [],
                correctAnswer: null,
                image: null,
                group: currentGroup,
                groupNumber: parseInt(currentGroup.match(/\d+(\.\d+)?/g))
            };
            const img = element.querySelector('img');
            if (img && img.src) {
                currentQuestion.image = img.src;
            }
        } else if (tagName === 'ol' && currentQuestion) {
            const listItems = element.querySelectorAll('li');
            const options = [];
            let correctIndex = null;

            listItems.forEach((li, index) => {
                let optionText = li.textContent.trim();
                let isCorrect = false;
                let multiVals = null;

                if (optionText.includes('multi-')) {
                    const multiRes = optionText.split('multi-')[1].trim();
                    if (multiRes === "all") {
                        multiVals = ["all"];
                    } else {
                        multiVals = multiRes.match(/\d+/g);
                    }
                    optionText = optionText.split('multi')[0].trim();
                }

                if (optionText.includes('|1')) {
                    optionText = optionText.split('|1')[0].trim();
                    isCorrect = true;
                    correctIndex = index;
                }

                options.push({
                    text: optionText,
                    originalIndex: index,
                    isCorrect: isCorrect,
                    multiVals: multiVals
                });
            });

            const shuffledOptions = shuffleArray(options);
            currentQuestion._originalOptions = options;

            const normalOptions = [];
            const multiOptions = [];
            const allOptions = [];

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

            const finalOptions = [...normalOptions, ...multiOptions, ...allOptions];
            let newCorrectIndex = null;

            finalOptions.forEach((option, finalIndex) => {
                if (option.multiVals != null && option.multiVals[0] !== "all") {
                    const valsArr = option.multiVals[0].split("");
                    const newNumbers = [];
                    valsArr.forEach(element => {
                        const originalElement = options[parseInt(element) - 1];
                        if (originalElement) {
                            const newPosition = finalOptions.findIndex(opt => opt === originalElement);
                            newNumbers.push(newPosition + 1);
                        }
                    });
                    newNumbers.sort((a, b) => a - b);
                    let numbersInText = option.text.match(/\d+/g) || [];
                    if (numbersInText.length === newNumbers.length) {
                        let newText = option.text;
                        numbersInText.forEach((num, index) => {
                            newText = newText.replace(num, newNumbers[index].toString());
                        });
                        option.text = newText;
                    }
                }
                currentQuestion.options.push(option.text);
                if (option.isCorrect) {
                    newCorrectIndex = finalIndex;
                }
            });

            if (newCorrectIndex !== null) {
                currentQuestion.correctAnswer = newCorrectIndex;
            }
            currentQuestion._originalCorrect = correctIndex;
            currentQuestion._shuffledCorrect = newCorrectIndex;
        } else if (tagName === 'img' && currentQuestion && currentQuestion.options.length === 0) {
            currentQuestion.image = element.src;
        } else if (tagName === 'p' && currentQuestion && currentQuestion.options.length === 0 && text) {
            currentQuestion.question += ' ' + text;
        }
    }

    if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
        reallyAllQuestions.push(currentQuestion);
    }

    return questions;
}

function displayTest(questions) {
    const questionsContainer = document.getElementById('questions');
    const testContainer = document.getElementById('testContainer');

    questionsContainer.innerHTML = '';
    window.allQuestions = questions;
    window.currentQuestions = questions;

    questions.forEach((q, qIndex) => {
        qAmount += 1;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.id = `question-${qIndex}`;
        questionDiv.dataset.group = q.group;

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
    checkAnswer(questionIndex, optionIndex, true);
}

function checkAnswer(questionIndex, selectedOptionIndex, addResult) {
    const question = testData[questionIndex];
    const optionDiv = document.querySelector(`#q${questionIndex}o${selectedOptionIndex}`).closest('.option');
    const allOptions = document.querySelectorAll(`#question-${questionIndex} .option`);
    const questionNumber = document.querySelector(`#question-${questionIndex} .question-number`);

    if (currentSession && !currentSession.userAnswers) {
        currentSession.userAnswers = {};
    }
    if (currentSession) {
        const selectedOption = question._originalOptions.find(opt => opt.text === question.options[selectedOptionIndex]);
        if (selectedOption) {
            currentSession.userAnswers[questionIndex] = selectedOption.originalIndex;
        }
    }

    const isCorrect = selectedOptionIndex === question.correctAnswer;

    if (isCorrect) {
        if (addResult) logCorrectAnswer(questionIndex);
        const question = document.getElementById(`question-${questionIndex}`);
        scrollToNextVisibleQuestion("next", question);
    } else {
        if (addResult) logError(questionIndex);
    }

    if (isCorrect) {
        if (!optionDiv.classList.contains('correct')) {
            if (optionDiv.parentElement.classList.contains('wasincorrect')) {
                optionDiv.parentElement.classList.remove('wasincorrect');
            }
            optionDiv.classList.add('correct');
            optionDiv.parentElement.classList.add('wascorrect');
            if (!questionNumber.classList.contains('red')) {
                questionNumber.classList.add('green');
                if (addResult) updateTotalResult("+");
            }
        }
    } else {
        const parent = optionDiv.parentElement;
        if (optionDiv.parentElement.classList.contains('wascorrect')) {
            return
            //optionDiv.parentElement.classList.remove('wascorrect');
        }
        const children = Array.from(parent.children);
        const hasIncorrectChild = children.some(child => child.classList.contains('incorrect'));
        if (hasIncorrectChild) {
            optionDiv.classList.add('incorrect');
        } else if (!optionDiv.classList.contains('incorrect')) {
            optionDiv.classList.add('incorrect');
            if (!document.getElementById(`wrong-${questionIndex}`)) {
                const questionNumber = question.question.split(' ')[0];
                wrongList.innerHTML += `<span id="wrong-${questionIndex}" class="wrong-q">${questionNumber}</span>`;
            }
        }
        parent.classList.add('wasincorrect');
        if (!questionNumber.classList.contains('red')) {
            questionNumber.classList.add('red');
            if (addResult) updateTotalResult("-");
        }
    }

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
        remainsP.textContent = Number(remainsP.textContent) - 1;
    } else if (operation == "-") {
        incorrectP.textContent = Number(incorrectP.textContent) + 1;
        remainsP.textContent = Number(remainsP.textContent) - 1;
    } else if (operation == "clear") {
        correctP.textContent = 0;
        incorrectP.textContent = 0;
        remainsP.textContent = qAmount;
        endSession();
    } else if (operation == "-+") {
        correctP.textContent = Number(correctP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    } else if (operation == "--") {
        incorrectP.textContent = Number(incorrectP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    }
}

// Сброс теста
function resetTest() {
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    document.querySelectorAll('.option').forEach(option => {
        option.classList.remove('correct', 'incorrect');
    });
    document.querySelectorAll('.wascorrect').forEach(el => {
        el.classList.remove("wascorrect");
    });
    document.querySelectorAll('.wasincorrect').forEach(el => {
        el.classList.remove("wasincorrect");
    });
    document.querySelectorAll('.question-number').forEach(el => {
        el.classList.remove("green");
        el.classList.remove("red");
    });
    document.querySelector('.wrong-list').innerHTML = '';
    updateTotalResult("clear");
    localStorage.removeItem(SESSION_KEY); // Удаляем сохраненную сессию
    currentSession = null; // Очищаем текущую сессию
    startNewSession(); // Начинаем новую сессию
    scrollToTopBtn.click();
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
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
            const hasImages = div.querySelector('img') !== null || div.innerHTML.includes('data:image');
            div.style.display = hasImages ? 'block' : 'none';
        } else if (groupName === 'without_images') {
            const hasImages = div.querySelector('img') !== null || div.innerHTML.includes('data:image');
            div.style.display = hasImages ? 'none' : 'block';
        } else if (groupName === 'wrong') {
            const index = parseInt(div.id.replace('question-', ''), 10);
            div.style.display = currentSession.errors.includes(index) ? 'block' : 'none';
        } else {
            div.style.display = div.dataset.group === groupName ? 'block' : 'none';
        }
    });

    if (groupName === 'all') {
        window.currentQuestions = window.allQuestions;
    } else if (groupName === 'with_images') {
        window.currentQuestions = window.allQuestions.filter(hasQuestionImages);
    } else if (groupName === 'without_images') {
        window.currentQuestions = window.allQuestions.filter(q => !hasQuestionImages(q));
    } else if (groupName === 'wrong') {
        window.currentQuestions = currentSession.errors.map(i => window.allQuestions[i]);
    } else {
        window.currentQuestions = window.allQuestions.filter(q => q.group === groupName);
    }
}

function hasQuestionImages(question) {
    const questionHasImages = question.question.includes('<img') || question.question.includes('data:image') || question.question.includes('src=');
    const optionsHaveImages = question.options.some(option => option.includes('<img') || option.includes('data:image') || option.includes('src='));
    const explanationHasImages = question.explanation && (question.explanation.includes('<img') || question.explanation.includes('data:image') || question.explanation.includes('src='));
    return questionHasImages || optionsHaveImages || explanationHasImages;
}

function displayGroupSelector() {
    const groupSelector = document.getElementById('groupSelector');
    const groupSelect = document.createElement('select');
    groupSelect.classList.add('mySelect');

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
    }

    const totalQuestions = window.allQuestions.length;
    const wrongCount = currentSession?.errors?.length || 0;

    groupSelect.innerHTML = `
        <option value="all">Все вопросы (${totalQuestions})</option>
        <option value="with_images">🖼️ С картинками (${withImagesCount})</option>
        <option value="without_images">📝 Без картинок (${withoutImagesCount})</option>
        <option value="wrong">❌ Вопросы с ошибками (${wrongCount})</option>
    `;

    const groups = [...new Set(window.allQuestions.map(q => q.group))];
    const groupCounts = {};
    window.allQuestions.forEach(question => {
        if (question.group) {
            groupCounts[question.group] = (groupCounts[question.group] || 0) + 1;
        }
    });

    const sorted = groups.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.match(/\d+/)?.[0] || 0);
        return numA - numB;
    });

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

const scrollToTopBtn = document.getElementById('scrollToTopBtn');
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

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
                    resolve();
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
const infoDiv = document.getElementById("loading");

toCacheButton.addEventListener("click", async function () {
    await fileDB.init();
    await fileDB.saveFile(selectedVersion, htmlTest).then(() => console.log("Файл успешно сохранен."));
    infoDiv.style.display = 'block';
    infoDiv.textContent = "Запись добавлена в кэш! ✅";
    setTimeout(() => {
        infoDiv.style.display = 'none';
    }, 1000);
});

clearCacheButton.addEventListener("click", async function () {
    await fileDB.init();
    const prevText = infoDiv.textContent;
    await fileDB.deleteFile(selectedVersion);
    infoDiv.style.display = 'block';
    setTimeout(() => {
        infoDiv.textContent = prevText;
        if (prevText == "Читаю кэш... ⏳" || prevText == "Читаю файл... ⏳" || prevText == "Ищу на сервере... ⏳") infoDiv.style.display = 'none';
    }, 1000);

});

fromCacheButton.addEventListener("click", async function () {
    await fileDB.init();
    const content = await fileDB.loadFile(selectedVersion);
    if (content) {
        infoDiv.style.display = 'block';
        infoDiv.textContent = 'Читаю кэш... ⏳';
        setTimeout(() => {
            processFile(content);
        }, 1000);
        resetTest();
    } else {
        console.log("Файл не найден.");
        infoDiv.style.display = 'block';
        infoDiv.textContent = "Записи в кэше нет! ⚠️";
    }
});

fromServer.addEventListener("click", async function () {
    processFile("web", selectedVersion);
    resetTest();
});

async function checkCache(storeName, key) {
    try {
        if (!fileDB.db) {
            await fileDB.init();
        }
        const transaction = fileDB.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const value = request.result;
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

async function checkCacheOnLoad(version) {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.textContent = 'Читаю кэш... ⏳';
    loadingDiv.style.display = 'block';
    try {
        console.log('🔄 Начинаем проверку кэша...');
        const result = await checkCache('files', version);
        if (result.isValid) {
            console.log(`✅ Файл ${version} существует и не пустой, загружаю...`);
            await processFile(result.value); // Wait for processFile to complete
            loadSession(); // Call loadSession after processFile
        } else if (result.exists) {
            console.log(`⚠️ Файл ${version} существует, но пустой`);
            loadingDiv.textContent = 'Запись в кэше некорректна, загрузите файл с сервера или ПК 📁';
        } else {
            console.log(`❌ Файл ${version} не существует`);
            loadingDiv.textContent = 'Запись в кэше отсутствует, загрузите файл с сервера или ПК 📁';
        }
    } catch (error) {
        console.error('❌ Ошибка при проверке кэша:', error);
        loadingDiv.textContent = 'Ошибка при проверке кэша! ⚠️';
    }
}

function initSessions() {
    // Проверяем наличие сохраненной сессии при загрузке
    loadSession();
}

// Функция сохранения сессии
function saveSession() {
    if (!currentSession || (currentSession.correctAnswers === 0 && currentSession.incorrectAnswers === 0)) {
        return;
    }
    try {
        currentSession.endTime = new Date().toLocaleString();
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    } catch (error) {
        console.warn('Не удалось сохранить сессию:', error);
    }
}

// Функция загрузки сессии
function loadSession() {
    try {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
            currentSession = JSON.parse(savedSession);
            if (currentSession.userAnswers && testData.length > 0) {
                Object.entries(currentSession.userAnswers).forEach(([qIndex, originalOptIndex]) => {
                    const questionIndex = parseInt(qIndex);
                    const question = testData[questionIndex];
                    if (!question) return;

                    // ищем где этот originalIndex оказался после перемешивания
                    const restoredOptionIndex = question._originalOptions[originalOptIndex]
                        ? question.options.findIndex(optText => optText === question._originalOptions[originalOptIndex].text)
                        : -1;

                    if (restoredOptionIndex !== -1) {
                        checkAnswer(questionIndex, restoredOptionIndex, false);
                    }
                });
                const correctP = document.getElementById('correctAmount');
                const incorrectP = document.getElementById('incorrectAmount');
                const remainsP = document.getElementById('remainsAmount');
                correctP.textContent = currentSession.correctAnswers;
                incorrectP.textContent = currentSession.incorrectAnswers;
                remainsP.textContent = currentSession.totalQuestions - currentSession.correctAnswers - currentSession.incorrectAnswers;
                wrongList.innerHTML = '';
                currentSession.errors.forEach(qIndex => {
                    const question = testData[qIndex];
                    if (question) {
                        const questionNumber = question.question.split(' ')[0];
                        wrongList.innerHTML += `<span id="wrong-${qIndex}" class="wrong-q">${questionNumber}</span>`;
                    }
                });
            }
        }
    } catch (error) {
        console.warn('Не удалось загрузить сессию:', error);
    }
}

// Сохранение сессии перед закрытием/перезагрузкой страницы
window.addEventListener('beforeunload', function () {
    saveSession();
});

function startNewSession() {
    currentSession = {
        id: Date.now(),
        startTime: new Date().toLocaleString(),
        endTime: null,
        errors: [],
        userAnswers: {},
        totalQuestions: qAmount,
        correctAnswers: 0,
        incorrectAnswers: 0
    };
}

function endSession() {
    if (!currentSession) return;
    if (currentSession.correctAnswers === 0 && currentSession.incorrectAnswers === 0) return;
    currentSession.endTime = new Date().toLocaleString();
}

function logError(questionIndex) {
    if (!currentSession) return;
    if (!currentSession.errors.includes(questionIndex)) {
        currentSession.errors.push(questionIndex);
        currentSession.incorrectAnswers++;
        displayGroupSelector();
    }
}

function logCorrectAnswer(questionIndex) {
    if (!currentSession) return;
    if (!currentSession.errors.includes(questionIndex)) {
        currentSession.correctAnswers++;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const savedVersion = loadVersionFromStorage();

    if (savedVersion) {
        // Восстанавливаем сохраненную версию
        applyVersion(savedVersion);
        selectedVersion = savedVersion;
    } else {
        applyVersion('prof-pl'); // Раскомментируйте если нужно
    }

    checkCacheOnLoad(selectedVersion);
    initSessions();


});

document.getElementById('docxFile').addEventListener('change', function (e) {
    const fileButton = this.parentElement;
    const buttonText = fileButton.querySelector('.file-button-text');
    const img = document.getElementById("processDocx");
    if (this.files.length > 0) {
        const fileName = this.files[0].name;
        const displayName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
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
});

const tooltip = document.getElementById('global-tooltip');
const images = document.querySelectorAll('.top-btn, .version');

// Таймер для автоматического скрытия
let hideTimer = null;

images.forEach(img => {
    img.addEventListener('mouseover', (event) => {
        const rect = img.getBoundingClientRect();
        if (img.classList.contains("version")) tooltip.textContent = "Выбрать ячейку кэша / файл для загрузки с сервера";
        else tooltip.textContent = img.alt;

        // Использование fixed позиции
        tooltip.style.position = 'fixed';
        tooltip.style.left = (rect.right) + 'px';
        tooltip.style.top = (rect.bottom) + 'px';
        tooltip.style.opacity = '1';

        // Очищаем предыдущий таймер, если был
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }

        // На мобильных устройствах сразу запускаем таймер скрытия
        if (isMobile) {
            hideTimer = setTimeout(() => {
                tooltip.style.opacity = '0';
                hideTimer = null;
            }, 1500); // 1.5 секунды
        }
    });

    img.addEventListener('mouseout', () => {
        // На мобильных устройствах не скрываем сразу (таймер уже работает)
        if (!isMobile) {
            tooltip.style.opacity = '0';
        }

        // Очищаем таймер при уходе с элемента (опционально)
        if (isMobile && hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
            tooltip.style.opacity = '0';
        }
    });
});

wrongList.addEventListener('wheel', (e) => {
    e.preventDefault();
    wrongList.scrollLeft += e.deltaY * 3;
});

wrongList.addEventListener('click', function (event) {
    if (event.target.classList.contains('wrong-q')) {
        const number = event.target.id.split('-')[1];
        const question = document.getElementById(`question-${number}`);
        scrollToNextVisibleQuestion("cur", question);
    }
});

function scrollToNextVisibleQuestion(mode, currentElement, offset = 80) {
    let target = currentElement;
    if (mode === "next") {
        if (isMobile) return;
        target = currentElement.nextElementSibling;
    } else if (mode === "prev") {
        if (isMobile) return;
        target = currentElement.previousElementSibling;
    }

    while (target) {
        if (target.id && target.id.startsWith('question-')) {
            const style = window.getComputedStyle(target);
            if (style.display !== 'none' && style.visibility !== 'hidden' && target.offsetParent !== null) {
                const elementRect = target.getBoundingClientRect();
                const elementTop = elementRect.top + window.scrollY;
                const scrollToPosition = elementTop - offset;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                const targetPosition = Math.min(scrollToPosition, maxScroll);
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                return;
            }
        }
        target = mode === "prev" ? target.previousElementSibling : target.nextElementSibling;
    }
    console.log(mode === "prev" ? 'Предыдущего видимого вопроса выше нет' : 'Следующего видимого вопроса ниже нет');
}

document.addEventListener('keydown', function (event) {
    const questionsContainer = document.getElementById('questions');
    if (!questionsContainer) return;

    // Найти текущий видимый вопрос
    const questions = questionsContainer.querySelectorAll('.question');
    let currentQuestion = null;
    for (const question of questions) {
        const rect = question.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < window.innerHeight) {
            currentQuestion = question;
            break;
        }
    }

    if (!currentQuestion) return;

    // Переключение вопросов
    if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        scrollToNextVisibleQuestion('prev', currentQuestion);
    } else if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        scrollToNextVisibleQuestion('next', currentQuestion);
    }

    // Выбор ответа цифрами 1-6
    const optionIndex = parseInt(event.key) - 1; // Преобразуем 1-6 в 0-5
    if (!isNaN(optionIndex) && optionIndex >= 0 && optionIndex <= 5) {
        event.preventDefault();
        const questionIndex = parseInt(currentQuestion.id.replace('question-', ''));
        const options = currentQuestion.querySelectorAll('.option');
        if (optionIndex < options.length) {
            selectOption(questionIndex, optionIndex);
        }
    }
});

const versionList = document.getElementById('version-list');
const versions = document.querySelectorAll('.version');

// Обработчик наведения на иконку
fromServer.addEventListener('mouseenter', () => {
    versionList.classList.remove('hidden');
});

// Обработчик ухода с области
fromServer.addEventListener('mouseleave', (e) => {
    // Проверяем, не перешел ли курсор на список версий
    if (!versionList.matches(':hover')) {
        versionList.classList.add('hidden');
    }
});

// Обработчик ухода со списка версий
versionList.addEventListener('mouseleave', () => {
    versionList.classList.add('hidden');
});

// Обработчик клика по варианту версии
versions.forEach(version => {
    version.addEventListener('click', () => {
        const versionId = version.id;

        // Применяем выбранную версию
        applyVersion(versionId);

        // Скрываем список после выбора
        versionList.classList.add('hidden');
    });
});

// Функция для сохранения версии в localStorage
function saveVersionToStorage(versionId) {
    localStorage.setItem('selectedVersion', versionId);
    selectedVersion = versionId;
}

// Функция для загрузки версии из localStorage
function loadVersionFromStorage() {
    return localStorage.getItem('selectedVersion');
}

// Функция применения выбранной версии
function applyVersion(versionId) {
    const version = document.getElementById(versionId);
    if (!version) return;

    // Убираем активность у всех версий
    versions.forEach(v => v.classList.remove('active'));

    // Добавляем активность выбранной версии
    version.classList.add('active');

    // Сохраняем в хранилище
    saveVersionToStorage(versionId);

    console.log('Применена версия:', versionId);
}

//Создать тест из 14 вопросов
function createTest() {
    if (!reallyAllQuestions || !Array.isArray(reallyAllQuestions)) {
        console.error('window.allQuestions не найден или не является массивом');
        return [];
    }

    const groups = {};

    // Группируем вопросы по groupNumber
    reallyAllQuestions.forEach(question => {
        const groupNum = question.groupNumber;
        if (!groups[groupNum]) {
            groups[groupNum] = [];
        }
        groups[groupNum].push(question);
    });

    // Выбираем случайный вопрос из каждой группы
    questions = Object.values(groups).map(group => {
        const randomIndex = Math.floor(Math.random() * group.length);
        return group[randomIndex];
    });

    qAmount = 0;
    testData = questions;

    resetTest();
    displayTest(questions);


}