import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { registerShopActions } from './hancAgent';
import { HeaderPageListsSection } from './types/PageForShow';
import { Products } from './types/Products';
import { getProduct } from './api';
import productsFromServer from './api/products.json';

interface AppContextInterface {
  currentPage: HeaderPageListsSection;
  setCurrentPage: React.Dispatch<React.SetStateAction<HeaderPageListsSection>>;
  favourites: Products[];
  setFavourites: React.Dispatch<React.SetStateAction<Products[]>>;
  cart: Products[];
  setCart: React.Dispatch<React.SetStateAction<Products[]>>;
  phones: Products[];
  setPhones: React.Dispatch<React.SetStateAction<Products[]>>;
  setTablets: React.Dispatch<React.SetStateAction<Products[]>>;
  setAccessories: React.Dispatch<React.SetStateAction<Products[]>>;
  tablets: Products[];
  accessories: Products[];
  handleAddFavourite: (model: Products) => void;
  handleAddCart: (model: Products) => void;
  handleIncrement: (id: number) => void;
  handleDecrement: (id: number) => void;
  itemCounts: Record<number, number>;
}

const AppContext = createContext<AppContextInterface | undefined>(undefined);

export const AppProvider: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  const [currentPage, setCurrentPage] = useState(HeaderPageListsSection.Home);
  const [favourites, setFavourites] = useState<Products[]>([]);
  const [cart, setCart] = useState<Products[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<number, number>>({});
  const [phones, setPhones] = useState<Products[]>([]);
  const [tablets, setTablets] = useState<Products[]>([]);
  const [accessories, setAccessories] = useState<Products[]>([]);
  const { pathname } = useLocation();

  // derive current page from the URL, so any navigation (links, back button,
  // voice agent changing location.hash) keeps it in sync
  useEffect(() => {
    switch (pathname.split('/')[1]) {
      case 'phones':
        setCurrentPage(HeaderPageListsSection.Phones);
        break;
      case 'tablets':
        setCurrentPage(HeaderPageListsSection.Tablets);
        break;
      case 'accessories':
        setCurrentPage(HeaderPageListsSection.Accessories);
        break;
      case 'favourites':
        setCurrentPage(HeaderPageListsSection.Favorites);
        break;
      case 'cart':
        setCurrentPage(HeaderPageListsSection.Cart);
        break;
      default:
        setCurrentPage(HeaderPageListsSection.Home);
        break;
    }
  }, [pathname]);

  // the voice agent changes the cart and favourites through these functions
  // (see hancAgent.ts); refs give them the current state, the functional
  // updates make a repeated command harmless
  const cartRef = useRef(cart);
  const favouritesRef = useRef(favourites);

  cartRef.current = cart;
  favouritesRef.current = favourites;

  useEffect(() => {
    const lists = {
      cart: { ref: cartRef, set: setCart },
      favourites: { ref: favouritesRef, set: setFavourites },
    };

    registerShopActions({
      add: (list, itemId) => {
        const product = productsFromServer.find(item => item.itemId === itemId);

        if (!product) {
          return 'missing';
        }

        const has = (items: Products[]) =>
          items.some(item => item.id === product.id);

        if (has(lists[list].ref.current)) {
          return 'already';
        }

        // commit now: the agent may ask for the cart right after the change
        flushSync(() => {
          lists[list].set(prev => (has(prev) ? prev : [...prev, product]));

          if (list === 'cart') {
            setItemCounts(prev =>
              prev[product.id] ? prev : { ...prev, [product.id]: 1 },
            );
          }
        });

        return 'added';
      },
      remove: (list, itemId) => {
        const product = productsFromServer.find(item => item.itemId === itemId);

        if (
          !product ||
          !lists[list].ref.current.some(item => item.id === product.id)
        ) {
          return 'missing';
        }

        flushSync(() => {
          lists[list].set(prev => prev.filter(item => item.id !== product.id));

          if (list === 'cart') {
            setItemCounts(prev => {
              const newCounts = { ...prev };

              delete newCounts[product.id];

              return newCounts;
            });
          }
        });

        return 'removed';
      },
      setQuantity: (itemId, quantity) => {
        const product = productsFromServer.find(item => item.itemId === itemId);

        if (!product) {
          return 'missing';
        }

        const inCart = cartRef.current.some(item => item.id === product.id);

        if (!quantity && !inCart) {
          return 'missing';
        }

        // like handleIncrement: the cart holds the product once per piece
        flushSync(() => {
          setCart(prev => [
            ...prev.filter(item => item.id !== product.id),
            ...Array(quantity).fill(product),
          ]);
          setItemCounts(prev => {
            const newCounts = { ...prev, [product.id]: quantity };

            if (!quantity) {
              delete newCounts[product.id];
            }

            return newCounts;
          });
        });

        if (!quantity) {
          return 'removed';
        }

        return inCart ? 'updated' : 'added';
      },
    });

    return () => registerShopActions(null);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const allProducts = await getProduct();

      const phonesData = allProducts.filter(
        product => product.category === 'phones',
      );
      const tabletsData = allProducts.filter(
        product => product.category === 'tablets',
      );
      const accessoriesData = allProducts.filter(
        product => product.category === 'accessories',
      );

      setPhones(phonesData);
      setTablets(tabletsData);
      setAccessories(accessoriesData);
    };

    fetchData();
  }, []);

  const handleAddFavourite = (model: Products) => {
    const index = favourites.findIndex(item => item.id === model.id);

    if (index !== -1) {
      // Model is already in favourites, remove it
      setFavourites(prevFavourites =>
        prevFavourites.filter(item => item.id !== model.id),
      );
    } else {
      // Model is not in favourites, add it
      setFavourites(prevFavourites => [...prevFavourites, model]);
    }
  };

  const handleAddCart = (model: Products) => {
    const index = cart.findIndex(item => item.id === model.id);

    if (index !== -1) {
      setCart(prevCart => prevCart.filter(item => item.id !== model.id));
      setItemCounts(prevCounts => {
        const newCounts = { ...prevCounts };

        delete newCounts[model.id];

        return newCounts;
      });
    } else {
      setCart(prevCart => [...prevCart, model]);
      setItemCounts(prevCounts => ({
        ...prevCounts,
        [model.id]: 1,
      }));
    }
  };

  const handleDecrement = (id: number) => {
    setItemCounts(prevCounts => {
      if (prevCounts[id] > 1) {
        setCart(prevCart => {
          const index = prevCart.findIndex(item => item.id === id);

          if (index > -1) {
            return [...prevCart.slice(0, index), ...prevCart.slice(index + 1)];
          }

          return prevCart;
        });

        return {
          ...prevCounts,
          [id]: prevCounts[id] - 1,
        };
      }

      return prevCounts;
    });
  };

  const handleIncrement = (id: number) => {
    setItemCounts(prevCounts => ({
      ...prevCounts,
      [id]: (prevCounts[id] || 1) + 1,
    }));
    setCart(prevCart => {
      const product = productsFromServer.find(item => item.id === id);

      if (product) {
        return [...prevCart, product];
      }

      return prevCart;
    });
  };

  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    const savedFavourites = localStorage.getItem('favourites');
    const savedItemCounts = localStorage.getItem('itemCounts');

    // saved items keep the price they had when added, so take the current
    // product data from the catalog
    const withCurrentData = (saved: string) =>
      (JSON.parse(saved) as Products[]).map(
        item =>
          productsFromServer.find(product => product.id === item.id) || item,
      );

    const savedCartItems = savedCart ? withCurrentData(savedCart) : [];
    const counts: Record<number, number> = savedItemCounts
      ? JSON.parse(savedItemCounts)
      : {};

    // items added from the product page used to be saved without a count
    savedCartItems.forEach(item => {
      if (!counts[item.id]) {
        counts[item.id] = 1;
      }
    });

    setCart(savedCartItems);
    setItemCounts(counts);

    if (savedFavourites) {
      setFavourites(withCurrentData(savedFavourites));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.setItem('favourites', JSON.stringify(favourites));
    localStorage.setItem('itemCounts', JSON.stringify(itemCounts));
  }, [cart, favourites, itemCounts]);

  return (
    <AppContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        favourites,
        setFavourites,
        cart,
        setCart,
        phones,
        tablets,
        accessories,
        handleAddFavourite,
        handleAddCart,
        handleDecrement,
        handleIncrement,
        itemCounts,
        setPhones,
        setTablets,
        setAccessories,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }

  return context;
};
